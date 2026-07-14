import type { FileData, FolderAggregation } from './api';

export interface FolderViewModel {
    name: string;
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
): FolderViewModel[] {
    return aggregations
        .map(folder => ({
            name: folder.name,
            files: [],
            fileCount: folder.fileCount,
            coverFile: folder.coverFile || undefined,
            latestDate: folder.latestDate,
            isFavorite: folder.isFavorite,
        }))
        .sort((a, b) => {
            const comparison = sort.key === 'name'
                ? a.name.localeCompare(b.name, 'zh-CN')
                : new Date(a.latestDate || 0).getTime() - new Date(b.latestDate || 0).getTime();
            return sort.direction === 'asc' ? comparison : -comparison;
        });
}

export function isFileViewEmpty(files: FileData[], folders: FolderViewModel[]): boolean {
    return files.length === 0 && folders.length === 0;
}
