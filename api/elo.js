const axios = require("axios");

const API = "https://open.faceit.com/data/v4";

module.exports = async (req, res) => {
    const nickname = "KarMaAHD";

    try {
        // =========================
        // PLAYER INFO
        // =========================
        const playerRes = await axios.get(
            `${API}/players?nickname=${nickname}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FACEIT_API_KEY}`
                }
            }
        );

        const player = playerRes.data;

        const playerId = player.player_id;

        const game = player.games.cs2 || player.games.csgo;

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

        for (const match of matches) {

            const matchDate = new Date(match.finished_at * 1000)
                .toISOString()
                .split("T")[0];

            if (matchDate !== today) continue;

            const statsRes = await axios.get(
                `${API}/matches/${match.match_id}/stats`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.FACEIT_API_KEY}`
                    }
                }
            );

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
