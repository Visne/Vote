"use strict";
const Axios = require("axios").default

module.exports = class GitHub {
    constructor(clientId, clientSecret) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    /**
     * Using a token gotten from GitHub, get an access token.
     * Either throws an error, or returns a valid access token.
     * @param code The token gotten from GitHub.
     * @returns {Promise} Promise with access token.
     */
    getAccessToken(code) {
        return Axios.post("https://github.com/login/oauth/access_token",
            {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
            },
            {
                headers: { accept: "application/json" }
            })
            .then((response) => {
                const { access_token, error, error_description, error_uri } = response.data;

                if (access_token === undefined && error !== undefined) {
                    throw new Error(`${error}: ${error_description}\nMore info at ${error_uri}`);
                } else if (access_token === undefined) {
                    throw new Error("Something went wrong getting access token.")
                }

                return access_token;
            });
    }

    /**
     * Get the user data associated with an access token.
     * @param accessToken The access token of the user.
     * @returns {Promise} The user data, stored in an object.
     * @throws If failed to get user data.
     */
    getUserData(accessToken) {
        return Axios.get("https://api.github.com/user",
            {
                headers: {
                    Authorization: "token " + accessToken
                }
            })
            .then((response) => {
                if (response.status === 200) {
                    return response.data;
                }

                throw new Error("Failed to get user data");
            });
    }
}