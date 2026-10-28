const axios = require("axios");

const API = "https://open.faceit.com/data/v4";

const PLAYER_ID = "ec19c7e0-66c1-41e2-82d8-2bb7642af60f"; // paste your FACEIT player ID

module.exports = async (req, res) => {

    try {
        // =========================
        // PLAYER INFO (fetched by ID — permanent, unaffected by nickname changes)
        // =========================
        const playerRes = await axios.get(
            `${API}/players/${PLAYER_ID}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FACEIT_API_KEY}`
                }
            }
        );

        const player = playerRes.data;

        const nickname = player.nickname; // always up-to-date, even if they rename
        const playerId = player.player_id;

        const game = player.games?.cs2 || player.games?.csgo;

        if (!game) throw new Error("No CS2/CSGO game data found for this player");

        const currentElo = game.faceit_elo;

        // =========================
        // MATCH HISTORY
        // =========================
        const historyRes = await axios.get(
            `${API}/players/${playerId}/history?game=cs2&offset=0&limit=20`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FACEIT_API_KEY}`
                }
            }
        );

        const matches = historyRes.data.items;

        const today = new Date().toISOString().split("T")[0];

        let wins = 0;
        let losses = 0;
        let eloDiff = 0;

        let totalKills = 0;
        let totalDeaths = 0;

        // Filter to only today's matches before firing API calls
        const todayMatches = matches.filter(match => {
            const matchDate = new Date(match.finished_at * 1000)
                .toISOString()
                .split("T")[0];
            return matchDate === today;
        });

        // Fetch all match stats in parallel instead of sequentially
        const statsResponses = await Promise.all(
            todayMatches.map(match =>
                axios.get(
                    `${API}/matches/${match.match_id}/stats`,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.FACEIT_API_KEY}`
                        }
                    }
                )
            )
        );

        for (const statsRes of statsResponses) {

            const rounds = statsRes.data.rounds || [];

            for (const round of rounds) {

                for (const team of round.teams) {

                    const foundPlayer = team.players.find(
                        p => p.player_id === playerId
                    );

                    if (!foundPlayer) continue;

                    const kills = parseInt(foundPlayer.player_stats.Kills);
                    const deaths = parseInt(foundPlayer.player_stats.Deaths);

                    totalKills += kills;
                    totalDeaths += deaths;

                    const result = foundPlayer.player_stats.Result;

                    // Note: +/-25 is an approximation; FACEIT ELO swings vary per match
                    if (result === "1") {
                        wins++;
                        eloDiff += 25;
                    } else {
                        losses++;
                        eloDiff -= 25;
                    }
                }
            }
        }

        const kd =
            totalDeaths > 0
                ? (totalKills / totalDeaths).toFixed(2)
                : totalKills > 0
                    ? "∞"
                    : "0.00";

        const eloText =
            eloDiff >= 0 ? `+${eloDiff}` : `${eloDiff}`;

        const formattedWins = wins.toString().padStart(2, "0");

        const formattedLosses = losses.toString().padStart(2, "0");

        res.status(200).send(
            `${nickname} | ${currentElo} elo | (Today: ${eloText} ; W: ${formattedWins} L: ${formattedLosses} ; ${kd}KD)`
        );

    } catch (err) {
        console.error(err.response?.data || err.message);

        res.status(200).send("Failed to fetch FACEIT stats");
    }
};
