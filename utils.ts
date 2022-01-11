const Crypto = require("crypto");

module.exports = {generateSessionId: () => {
        return Crypto.randomBytes(16).toString("base64");
    }, sendErrorResponse(response, message) {
        response.send(`Something went wrong, please try again. (${message})`);
    }, verifyConfig: (path) => {
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
    }, /**
     * Turns a TMDB or IMDb URL or ID into an ID, returns ID on success and reason on failure.
     * @param idOrUrl
     * @returns An object with id and reason parameters, one of which is defined.
     */
    movieIdOrUrlToId(idOrUrl) {
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
                    if (possibleId.match(/^\d{1,8}$/)) {
                        return { tmdbId: possibleId };
                    } else {
                        return { reason: "The URL is a valid TMDB URL, but the ID is empty or invalid!" };
                    }
                } else {
                    return { reason: "The URL is a valid TMDB URL, but not for a movie!" };
                }
            } else if (url.hostname === "www.imdb.com") {
                if (url.pathname.startsWith("/title")) {
                    // Get ID from url
                    const possibleId = url.pathname.split("/")[2];

                    // Return ID if matches with ID regex
                    if (/^tt\d{7,8}$/.test(possibleId)) {
                        return { imdbId: possibleId };
                    } else {
                        console.log(possibleId);
                        console.log(/^tt\d{7,8}$/.test(possibleId));
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
            if (idOrUrl.match(/^tt\d{7}$/)) {
                return { imdbId: idOrUrl };
            } else if (idOrUrl.match(/^\d{1,8}$/)) {
                return { tmdbId: idOrUrl };
            } else {
                return { reason: "Not a valid ID or URL (make sure you did not forget https://)!" };
            }
        }
    }}