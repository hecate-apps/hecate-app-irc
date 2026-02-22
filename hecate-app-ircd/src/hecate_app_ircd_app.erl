-module(hecate_app_ircd_app).
-behaviour(application).

-include_lib("reckon_db/include/reckon_db.hrl").

-export([start/2, stop/1]).

-dialyzer({nowarn_function, start_irc_store/0}).

start(_StartType, _StartArgs) ->
    case application:get_env(hecate_app_ircd, enabled, true) of
        false ->
            logger:info("[hecate_app_ircd] Disabled by config"),
            {ok, spawn(fun() -> receive stop -> ok end end)};
        true ->
            ok = app_ircd_paths:ensure_layout(),
            ok = ensure_pg_scope(),
            ok = start_irc_store(),
            ok = start_cowboy(),
            logger:info("[hecate_app_ircd] Started, socket at ~s",
                        [app_ircd_paths:socket_path("api.sock")]),
            hecate_app_ircd_sup:start_link()
    end.

stop(_State) ->
    ok = cowboy:stop_listener(app_ircd_http),
    cleanup_socket(),
    ok.

ensure_pg_scope() ->
    case pg:start_link(hecate_app_ircd) of
        {ok, _Pid} -> ok;
        {error, {already_started, _Pid}} -> ok
    end.

start_irc_store() ->
    DataDir = app_ircd_paths:reckon_path("irc"),
    ok = filelib:ensure_path(DataDir),
    Config = #store_config{
        store_id = irc_store,
        data_dir = DataDir,
        mode = single,
        writer_pool_size = 5,
        reader_pool_size = 5,
        gateway_pool_size = 2,
        options = #{}
    },
    case reckon_db_sup:start_store(Config) of
        {ok, _Pid} ->
            logger:info("[hecate_app_ircd] irc_store ready"),
            ok;
        {error, {already_started, _Pid}} ->
            logger:info("[hecate_app_ircd] irc_store already running"),
            ok;
        {error, Reason} ->
            logger:error("[hecate_app_ircd] Failed to start irc_store: ~p", [Reason]),
            error({irc_store_start_failed, Reason})
    end.

start_cowboy() ->
    SocketPath = app_ircd_paths:socket_path("api.sock"),
    cleanup_socket_file(SocketPath),
    Routes = [
        {"/health", app_ircd_health_api, []},
        {"/manifest", app_ircd_manifest_api, []},
        {"/api/irc/stream", stream_irc_api, []},
        {"/api/irc/channels", get_channels_page_api, []},
        {"/api/irc/channels/open", open_channel_api, []},
        {"/api/irc/channels/:channel_id/close", close_channel_api, []},
        {"/api/irc/channels/:channel_id/join", join_irc_channel_api, []},
        {"/api/irc/channels/:channel_id/part", part_irc_channel_api, []},
        {"/api/irc/channels/:channel_id/messages", relay_irc_message_api, []},
        {"/api/irc/channels/:channel_id/members", get_channel_members_api, []},
        {"/api/irc/nick", change_nick_api, []}
    ],
    Dispatch = cowboy_router:compile([{'_', Routes}]),
    TransOpts = #{
        socket_opts => [{ifaddr, {local, SocketPath}}],
        num_acceptors => 5
    },
    ProtoOpts = #{
        env => #{dispatch => Dispatch},
        idle_timeout => 600000,
        request_timeout => 600000
    },
    {ok, _} = cowboy:start_clear(app_ircd_http, TransOpts, ProtoOpts),
    ok.

cleanup_socket() ->
    SocketPath = app_ircd_paths:socket_path("api.sock"),
    cleanup_socket_file(SocketPath).

cleanup_socket_file(Path) ->
    case file:delete(Path) of
        ok -> ok;
        {error, enoent} -> ok;
        {error, Reason} ->
            logger:warning("[hecate_app_ircd] Failed to remove socket ~s: ~p", [Path, Reason]),
            ok
    end.
