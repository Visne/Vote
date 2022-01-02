module.exports = {
    verifyConfig: (path) => {
        const config = require(path);

        if (!config.hasOwnProperty("clientId")) {
            console.log("Config has no client ID specified");
            return false;
        } else if (!config.hasOwnProperty("clientSecret")) {
            console.log("Config has no client secret specified");
            return false;
        } else if (!config.hasOwnProperty("port")) {
            console.log("Config has no port specified");
            return false;
        }

        return true;
    }
}