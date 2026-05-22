export const statusColor = (percentage: number) => {
    if (percentage === 100) return "success";
    return percentage >= 50 ? "warning" : "error";
};

/**
 * Converts a strictly formatted "#RRGGBB" hex string and an alpha value into an RGBA string.
 *
 * @param hex - The hex string
 * @param alpha - Opacity value between 0 and 1.
 */
export function hexToRgba(hex: string, alpha: number) {
    const colorInt = parseInt(hex.slice(1), 16);

    const r = (colorInt >> 16) & 255;
    const g = (colorInt >> 8) & 255;
    const b = colorInt & 255;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
