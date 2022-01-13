import Axios from "axios";
import { MovieData } from "./database";

export default class MovieDB {
    private apiKey: string;

    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Gets the TMDB ID from an IMDb ID.
     * @param imdbId The IMDb ID.
     * @returns An object with either an `id` or a `reason` for failure.
     * @throws If no valid response code is returned, or on an exception.
     */
    async getIdFromImdbId(imdbId: string): Promise<{ id: number, reason?: never } | { reason: string, id?: never }> {
        // @ts-ignore
        return Axios.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
                params: {
                    api_key: this.apiKey,
                    external_source: "imdb_id",
                },
            })
            .then((response) => {
                if (response.status === 200) {
                    return { id: response.data.movie_results[0].id as number };
                } else if (response.status === 401) {
                    return { reason: "Invalid API key (contact Visne)." };
                } else if (response.status === 404) {
                    return { reason: "Movie is on IMDb, but not linked to TMDB! Try searching for the movie on TMDB." };
                } else {
                    throw new Error("getIdFromImdbId failed with response " + response);
                }
            });
    }

    async getMovieDetails(tmdbId: number): Promise<{ movieData?: MovieData, reason?: string }> {
        return Axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`,
                {
                    params: {
                        api_key: this.apiKey,
                    }
                })
            .then((response) => {
                return { movieData: response.data as MovieData };

            })
            .catch((error) => {
                if (error.response.status === 404) {
                    return { reason: "Movie not found!" };
                } else {
                    console.log(error.message);
                    console.log(error.stack);
                    throw new Error("Something went wrong while getting movie details.");
                }
            });
    }
}