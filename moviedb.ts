"use strict";
const Axios = require("axios").default

module.exports = class MovieDB {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Gets the TMDB ID from an IMDb ID.
     * @param imdbId The IMDb ID.
     * @returns { Promise<AxiosResponse<{ id: number, reason: string }>> } An object with either an `id` or a `reason` for failure.
     * @throws If no valid response code is returned, or on an exception.
     */
    async getIdFromImdbId(imdbId) {
        return Axios.get(`https://api.themoviedb.org/3/find/${imdbId}`,
            {
                params: {
                    api_key: this.apiKey,
                    external_source: "imdb_id",
                }
            })
            .then((response) => {
                if (response.status === 200) {
                    return { id: response.data.movie_results[0].id };
                } else if (response.status === 401) {
                    return { reason: "Invalid API key (contact Visne)." }
                } else if (response.status === 404) {
                    return { reason: "Movie is on IMDb, but not linked to TMDB! Try searching for the movie on TMDB." };
                } else {
                    throw new Error("getIdFromImdbId failed with response " + response);
                }
            });
    }
}