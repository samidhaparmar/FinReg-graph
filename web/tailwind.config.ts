import type { Config } from "tailwindcss";
export default { content: ["./src/**/*.{ts,tsx}"], theme: { extend: { colors: { ink: "#172b45", muted: "#6d7d91", canvas: "#f5f7fb", teal: "#0f846f", blue: "#2774d8", line: "#e3e9f1" } } }, plugins: [] } satisfies Config;
