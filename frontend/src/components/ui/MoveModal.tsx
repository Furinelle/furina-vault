import { motion, AnimatePresence } from "framer-motion";
import { Folder, FolderRoot, X, Check, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { useState, useEffect } from "react";

interface MoveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (destinationFolder: string | null) => void;
    currentFolder: string | null;
    folders: string[]; // List of available folder names
    title?: string;
}

export const MoveModal = ({ isOpen, onClose, onConfirm, currentFolder, folders, title }: MoveModalProps) => {
    const { t } = useTranslation();
    const [selectedFolder, setSelectedFolder] = useState<string | null>(currentFolder);

    useEffect(() => {
        if (isOpen) {
            setSelectedFolder(currentFolder);
        }
    }, [isOpen, currentFolder]);

    // Filter out the current folder from the list
    const availableFolders = folders.filter(f => f !== currentFolder);

    if (!isOpen) return null;

    const isChanged = selectedFolder !== currentFolder;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-md"
                    onClick={onClose}
                />
                
                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 20 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="relative w-full max-w-[420px] bg-card rounded-2xl shadow-2xl border border-border/60 overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
                                <ArrowRight className="h-4 w-4 text-primary" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground">
                                {title || t("app.moveTo") || "移动到"}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors"
                        >
                            <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Current location hint */}
                    {currentFolder && (
                        <div className="px-5 pt-3 pb-1">
                            <p className="text-xs text-muted-foreground">
                                当前位置：<span className="font-medium text-foreground/70">{currentFolder}</span>
                            </p>
                        </div>
                    )}

                    {/* Folder List */}
                    <div className="px-3 py-2 max-h-[340px] overflow-y-auto min-h-[200px]"
                        style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'hsl(var(--border)) transparent',
                        }}
                    >
                        <div className="space-y-0.5">
                            {/* Root Folder Option */}
                            <button
                                onClick={() => setSelectedFolder(null)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group ${
                                    selectedFolder === null
                                        ? "bg-primary/10 ring-1 ring-primary/20"
                                        : "hover:bg-muted/60"
                                }`}
                            >
                                <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                                    selectedFolder === null
                                        ? "bg-primary/15"
                                        : "bg-muted/80 group-hover:bg-muted"
                                }`}>
                                    <FolderRoot className={`h-4 w-4 ${
                                        selectedFolder === null ? "text-primary" : "text-muted-foreground"
                                    }`} />
                                </div>
                                <span className={`flex-1 text-sm truncate ${
                                    selectedFolder === null ? "text-primary font-medium" : "text-foreground"
                                }`}>
                                    {t("app.rootDirectory") || "根目录"}
                                </span>
                                {selectedFolder === null && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="flex items-center justify-center w-5 h-5 rounded-full bg-primary"
                                    >
                                        <Check className="h-3 w-3 text-white" />
                                    </motion.div>
                                )}
                            </button>

                            {/* Divider */}
                            {availableFolders.length > 0 && (
                                <div className="my-1.5 mx-3 border-t border-border/30" />
                            )}

                            {/* Existing Folders */}
                            {availableFolders.map((folder) => (
                                <button
                                    key={folder}
                                    onClick={() => setSelectedFolder(folder)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group ${
                                        selectedFolder === folder
                                            ? "bg-primary/10 ring-1 ring-primary/20"
                                            : "hover:bg-muted/60"
                                    }`}
                                >
                                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                                        selectedFolder === folder
                                            ? "bg-primary/15"
                                            : "bg-muted/80 group-hover:bg-muted"
                                    }`}>
                                        <Folder className={`h-4 w-4 ${
                                            selectedFolder === folder ? "text-primary fill-primary/20" : "text-muted-foreground"
                                        }`} />
                                    </div>
                                    <span className={`flex-1 text-sm truncate ${
                                        selectedFolder === folder ? "text-primary font-medium" : "text-foreground"
                                    }`} title={folder}>
                                        {folder}
                                    </span>
                                    {selectedFolder === folder && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="flex items-center justify-center w-5 h-5 rounded-full bg-primary"
                                        >
                                            <Check className="h-3 w-3 text-white" />
                                        </motion.div>
                                    )}
                                </button>
                            ))}

                            {/* Empty state */}
                            {availableFolders.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                    <Folder className="h-10 w-10 mb-2 opacity-30" />
                                    <p className="text-sm">暂无其它文件夹</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3.5 border-t border-border/40 flex justify-end gap-2.5">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            className="px-4 h-9 rounded-lg text-sm font-medium"
                        >
                            {t("app.cancel") || "取消"}
                        </Button>
                        <Button 
                            onClick={() => {
                                onConfirm(selectedFolder);
                                onClose();
                            }} 
                            className="px-5 h-9 rounded-lg text-sm font-medium shadow-sm"
                            disabled={!isChanged}
                        >
                            {t("app.confirm") || "确定"}
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
