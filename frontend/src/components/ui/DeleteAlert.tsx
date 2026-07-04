import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { createPortal } from "react-dom";

interface DeleteAlertProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    fileName?: string;
    itemCount?: number;
    folderCount?: number;
}

export const DeleteAlert = ({ isOpen, onClose, onConfirm, fileName, itemCount, folderCount = 0 }: DeleteAlertProps) => {
    const { t } = useTranslation();
    const [isDeleting, setIsDeleting] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (isDeleting) return;
        setIsDeleting(true);
        try {
            await onConfirm();
            onClose();
        } finally {
            setIsDeleting(false);
        }
    };

    const modalContent = (
        <AnimatePresence>
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={isDeleting ? undefined : onClose}
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden z-[70] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/30">
                        <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                            <Trash2 className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-lg leading-none tracking-tight">
                                {t("delete.title") || "确认删除"}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1.5">
                                {t("delete.subtitle") || "此操作无法撤销"}
                            </p>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex-1">
                                <p className="text-sm text-foreground/80 leading-relaxed">
                                    {itemCount ? (
                                        <>
                                            即将删除 <span className="font-semibold text-foreground">{itemCount}</span> 个项目。
                                            {folderCount > 0 && (
                                                <>
                                                    <br />其中包含 <span className="font-semibold text-foreground">{folderCount}</span> 个文件夹，文件夹内文件也会一并删除。
                                                </>
                                            )}
                                            <br className="mb-2" />
                                            删除后将无法恢复，请确认是否继续？
                                        </>
                                    ) : fileName ? (
                                        <>
                                            即将删除文件 <span className="font-semibold text-foreground break-all">"{fileName}"</span>。
                                            <br className="mb-2" />
                                            删除后将无法恢复，请确认是否继续？
                                        </>
                                    ) : (
                                        t("delete.description") || "确定要永久删除此文件吗？删除后将无法恢复。"
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Footer - Buttons */}
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
                        <Button
                            variant="outline"
                            className="h-10 px-5 text-sm font-medium border-border/80 hover:bg-muted"
                            onClick={isDeleting ? undefined : onClose}
                        >
                            {t("delete.cancel") || "取消"}
                        </Button>
                        <Button
                            className="h-10 px-5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white shadow-sm border border-red-700/50"
                            onClick={handleConfirm}
                            disabled={isDeleting}
                        >
                            {isDeleting ? "删除中..." : (t("delete.confirm") || "确认删除")}
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
};
