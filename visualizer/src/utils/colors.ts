export const statusColor = (percentage: number) => {
    if (percentage === 100) return "success";
    return percentage >= 50 ? "warning" : "error";
};
