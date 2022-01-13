const SQLite = require("better-sqlite3");

export default class Database {
    public database;

    constructor(path) {
        this.database = SQLite(path);

        this.database.pragma("journal_mode = WAL");
        this.database.pragma("synchronous = NORMAL");
    }

    /**
     * Create database tables if they do not exist yet.
     */
    createTablesIfNotExists(): void {
        // Stores user data
        this.database.prepare(`CREATE TABLE IF NOT EXISTS users
            (
                id                 INTEGER PRIMARY KEY, -- Primary ID, alias for ROWID --
                oauth_id           INTEGER NOT NULL,    -- ID provided by OAuth provider --
                oauth_provider     TEXT    NOT NULL,    -- OAuth provider --
                oauth_access_token TEXT,                -- Access token for OAuth provider --
                session_id         TEXT,                -- Session ID cookie, unique and unguessable --
                session_expiry     INTEGER,             -- Expiry of session, in milliseconds since 1 Jan 1970 --
                UNIQUE (oauth_id, oauth_provider)       -- Combination of provider and ID must be unique --
            );
        `).run();

        // Stores movie data
        this.database.prepare(`CREATE TABLE IF NOT EXISTS movies
            (
                id           INTEGER PRIMARY KEY,
                tmdb_id      TEXT NOT NULL UNIQUE, -- https://developers.themoviedb.org/3/movies/get-movie-details --
                imdb_id      TEXT,                 -- starts with "tt" followed by 7 digits
                title        TEXT NOT NULL,
                release_date TEXT NOT NULL,
                poster_path  TEXT,
                overview     TEXT,
                tagline      TEXT,
                genres       TEXT,
                date_added   INTEGER NOT NULL
            );
        `).run();
    }

    /**
     * Get user data from a session ID.
     * @param session Session cookie, associated with a user.
     * @returns {UserData} Userdata of the user associated with the cookie.
     * @see UserData
     */
    getUserdataFromSession(session: string): UserData {
        return this.database.prepare(`
            SELECT * FROM users
            WHERE session_id = '${session}'
            AND ${Date.now()} < session_expiry;
        `).get();
    }

    insertGithubUserData(user: UserData) : void {
        const statement = this.database.prepare(`
                    INSERT INTO users
                    (
                        oauth_id,
                        oauth_provider,
                        oauth_access_token,
                        session_id,
                        session_expiry
                    )
                    VALUES
                    (
                        @oauth_id,
                        @oauth_provider,
                        @oauth_access_token,
                        @session_id,
                        @session_expiry
                    )
                    ON CONFLICT(oauth_id, oauth_provider)
                    DO UPDATE SET
                        oauth_access_token='${user.oauth_access_token}',
                        session_id='${user.session_id}',
                        session_expiry='${user.session_expiry}';
                `);

        statement.run(user);
    }

    insertMovieData(movie: MovieData) : boolean {
        if (this.database.prepare(`
            SELECT * FROM movies
            WHERE tmdb_id = ?;
        `).get(movie.id)) {
            return false;
        }

        let statement = this.database.prepare(`
                    INSERT INTO movies
                    (
                        tmdb_id,
                        imdb_id,
                        title,
                        release_date,
                        poster_path,
                        overview,
                        tagline,
                        genres,
                        date_added
                    )
                    VALUES
                    (
                        @tmdb_id,
                        @imdb_id,
                        @title,
                        @release_date,
                        @poster_path,
                        @overview,
                        @tagline,
                        @genres,
                        @date_added
                    );
                `);

        statement.run({
            tmdb_id: movie.id,
            imdb_id: movie.imdb_id || "",
            title: movie.title,
            release_date: new Date(movie.release_date).getTime(),
            poster_path: movie.poster_path || "",
            overview: movie.overview || "",
            tagline: movie.tagline || "",
            genres: JSON.stringify(movie.genres.map(genre => genre.name)),
            date_added: Date.now(),
        });

        return true;
    }

    public getMovies(): MovieData[] {
        return this.database.prepare(`SELECT * FROM movies;`).all() as MovieData[];
    }
}

export type UserData = {
    oauth_id: number,
    oauth_provider: string,
    oauth_access_token?: string,
    session_id?: string,
    session_expiry?: number,
}

export type MovieData = {
    id: number,
    imdb_id?: string,
    title: string,
    release_date: string,
    poster_path?: string,
    overview?: string,
    tagline?: string,
    genres?: [{ id: number, name: string }],
    date_added: number,
}