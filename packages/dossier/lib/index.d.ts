/** npm packages holding the prebuilt binary, by process.platform and process.arch. */
export declare const platforms: Readonly<Record<string, string>>;

/**
 * The absolute path of the dossier binary: DOSSIER_BIN when set, otherwise the
 * binary from this platform's package. Throws with a remedy when neither exists.
 */
export declare function binaryPath(): string;
