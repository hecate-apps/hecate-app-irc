-module(hecate_app_ircd_sup).
-behaviour(supervisor).

-export([start_link/0]).
-export([init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    SupFlags = #{strategy => one_for_one, intensity => 10, period => 60},
    ChildSpecs = [
        %% ── PG emitters (internal) ──
        #{id => channel_opened_v1_to_pg,
          start => {channel_opened_v1_to_pg, start_link, []},
          restart => permanent, type => worker},
        #{id => channel_closed_v1_to_pg,
          start => {channel_closed_v1_to_pg, start_link, []},
          restart => permanent, type => worker},

        %% ── Mesh emitters (external) ──
        #{id => channel_opened_v1_to_mesh,
          start => {channel_opened_v1_to_mesh, start_link, []},
          restart => permanent, type => worker},
        #{id => channel_closed_v1_to_mesh,
          start => {channel_closed_v1_to_mesh, start_link, []},
          restart => permanent, type => worker},

        %% ── Relay infrastructure ──
        #{id => relay_irc_message_sup,
          start => {relay_irc_message_sup, start_link, []},
          restart => permanent, type => supervisor},

        %% ── Presence relay (mesh -> pg) ──
        #{id => irc_presence_relay,
          start => {irc_presence_relay, start_link, []},
          restart => permanent, type => worker},

        %% ── Query: SQLite store (must start before projections) ──
        #{id => query_irc_store,
          start => {query_irc_store, start_link, []},
          restart => permanent, type => worker},

        %% ── Query: Projections ──
        #{id => channel_opened_v1_to_channels,
          start => {channel_opened_v1_to_channels, start_link, []},
          restart => permanent, type => worker},
        #{id => channel_closed_v1_to_channels,
          start => {channel_closed_v1_to_channels, start_link, []},
          restart => permanent, type => worker},

        %% ── Mesh listener for remote channel announcements ──
        #{id => subscribe_to_mesh_channel_opened,
          start => {subscribe_to_mesh_channel_opened, start_link, []},
          restart => permanent, type => worker},

        %% ── Plugin registrar ──
        #{id => app_ircd_plugin_registrar,
          start => {app_ircd_plugin_registrar, start_link, []},
          restart => transient, type => worker}
    ],
    {ok, {SupFlags, ChildSpecs}}.
