import type { FileData, FolderAggregation } from './api';

export interface FolderViewModel {
    name: string;
    displayName?: string;
    files: FileData[];
    fileCount: number;
    coverFile?: FileData;
    latestDate?: string;
    isFavorite?: boolean;
}

export interface FolderSortConfig {
    key: 'name' | 'date';
    direction: 'asc' | 'desc';
}

export function buildFolderViewModels(
    aggregations: FolderAggregation[],
    sort: FolderSortConfig,
    currentFolder: string | null = null,
): FolderViewModel[] {
    const prefix = currentFolder ? `${currentFolder}/` : '';
    const grouped = new Map<string, FolderViewModel>();

    for (const aggregation of aggregations) {
        if (currentFolder && aggregation.name === currentFolder) continue;
        if (prefix && !aggregation.name.startsWith(prefix)) continue;

        const relative = prefix ? aggregation.name.slice(prefix.length) : aggregation.name;
        const childSegment = relative.split('/')[0];
        if (!childSegment) continue;

        const childPath = prefix ? `${currentFolder}/${childSegment}` : childSegment;
        const candidateFiles = aggregation.coverFile ? [aggregation.coverFile] : [];
        const existing = grouped.get(childPath);
        if (!existing) {
            grouped.set(childPath, {
                name: childPath,
                displayName: childSegment,
                files: candidateFiles,
                fileCount: aggregation.fileCount,
                coverFile: aggregation.coverFile || undefined,
                latestDate: aggregation.latestDate,
                isFavorite: aggregation.isFavorite,
            });
            continue;
        }

        existing.fileCount += aggregation.fileCount;
        existing.files.push(...candidateFiles);
        existing.isFavorite = !!existing.isFavorite && aggregation.isFavorite;
        if (!existing.latestDate || new Date(aggregation.latestDate) > new Date(existing.latestDate)) {
            existing.latestDate = aggregation.latestDate;
            existing.coverFile = aggregation.coverFile || existing.coverFile;
        }
    }

    return Array.from(grouped.values()).sort((a, b) => {
        const comparison = sort.key === 'name'
            ? (a.displayName || a.name).localeCompare(b.displayName || b.name, 'zh-CN')
            : new Date(a.latestDate || 0).getTime() - new Date(b.latestDate || 0).getTime();
        return sort.direction === 'asc' ? comparison : -comparison;
    });
}

export function isFileViewEmpty(files: FileData[], folders: FolderViewModel[]): boolean {
    return files.length === 0 && folders.length === 0;
}
