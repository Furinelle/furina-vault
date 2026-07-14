export interface ActiveStorageAccountRow {
    id: string;
    type: string;
}

export function validateConfiguredStorageTarget(
    configuredProvider: string,
    activeAccounts: ActiveStorageAccountRow[],
): ActiveStorageAccountRow | null {
    if (configuredProvider === 'local') {
        if (activeAccounts.length > 0) {
            throw new Error('configured local storage conflicts with an active cloud account');
        }
        return null;
    }
    if (activeAccounts.length !== 1 || activeAccounts[0].type !== configuredProvider) {
        throw new Error(`configured cloud storage target ${configuredProvider} is missing or inconsistent`);
    }
    return activeAccounts[0];
}
