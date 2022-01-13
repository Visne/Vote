import { randomBytes } from "crypto";

export default class Utils {
    public static generateSessionId(): string {
        return randomBytes(16).toString("base64");
    }

    public static sendErrorResponse(response, message): void {
        response.send(`Something went wrong, please try again. (${message})`);
    }

    public static verifyConfig(path): boolean {
        const config = require(path);

        if (!config.hasOwnProperty("clientId")) {
            console.log("Config has no client ID specified");
            return false;
        } else if (!config.hasOwnProperty("clientSecret")) {
            console.log("Config has no client secret specified");
            return false;
        } else if (!config.hasOwnProperty("tmdbApiKey")) {
            console.log("Config has no The Movie Database API key specified")
        } else if (!config.hasOwnProperty("port")) {
            console.log("Config has no port specified");
            return false;
        }

        return true;
    }

    /**
     * Turns a TMDB or IMDb URL or ID into an ID, returns ID on success and reason on failure.
     * @param idOrUrl
     * @returns An object with id and reason parameters, one of which is defined.
     */
    public static movieIdOrUrlToId(idOrUrl: string): TmdbId | ImdbId | Reason {
        if (idOrUrl === null || idOrUrl === undefined || idOrUrl.length === 0) {
            return { reason: "ID or URL is empty!" };
        }

        try {
            let url = new URL(idOrUrl);

            // If not thrown at this point, we have a valid URL
            // Check if it is a valid TMDB or IMDb movie URL
            if (url.hostname === "www.themoviedb.org") {
                if (url.pathname.startsWith("/movie")) {
                    // Get ID from url
                    const possibleId = url.pathname.split(/[\/-]/)[2];

                    // Return ID if matches with ID regex
                    if (/^\d{1,8}$/.test(possibleId)) {
                        return { tmdbId: parseInt(possibleId) };
                    } else {
                        return { reason: "The URL is a valid TMDB URL, but the ID is empty or invalid!" };
                    }
                } else {
                    return { reason: "The URL is a valid TMDB URL, but not for a movie!" };
                }
            } else if (url.hostname === "www.imdb.com") {
                if (url.pathname.startsWith("/title")) {
                    // Get ID from url
                    const possibleId: string = url.pathname.split("/")[2];

                    // Return ID if matches with ID regex
                    if (/^tt\d{7}/.test(possibleId)) {
                        return { imdbId: possibleId };
                    } else {
                        return { reason: "The URL is a valid IMDb URL, but the ID is empty or invalid!" };
                    }
                } else {
                    return { reason: "The URL is a valid IMDb URL, but not for a movie!" };
                }
            } else {
                // Not TMDB or IMDb url, or not movie URL of those sites
                return { reason: "The provided URL is not www.imdb.com or www.themoviedb.org!" };
            }
        } catch (e) {
            // ID is not a URL, check if valid ID instead
            if (/^tt\d{7}/.test(idOrUrl)) {
                return { imdbId: idOrUrl };
            } else if (/^\d{1,8}$/.test(idOrUrl)) {
                return { tmdbId: parseInt(idOrUrl) };
            } else {
                return { reason: "Not a valid ID or URL (make sure you did not forget https://)!" };
            }
        }
    }
}

export type TmdbId = { tmdbId: number, imdbId?: never, reason?: never };
export type ImdbId = { tmdbId?: never, imdbId: string, reason?: never };
export type Reason = { tmdbId?: never, imdbId?: never, reason: string };