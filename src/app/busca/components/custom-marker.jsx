const baseStyle = {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#8B6F4B",
    color: "white",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "3px solid white",
    fontFamily: "var(--font-michroma), Helvetica, sans-serif",
    fontSize: "9px",
    fontWeight: 700,
    lineHeight: "1",
    letterSpacing: "-0.02em",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
    textTransform: "uppercase",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    padding: "0 4px",
};

export default function CustomMarker({ text, active = false }) {
    const style = active
        ? {
            ...baseStyle,
            transform: "scale(1.1)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
            borderColor: "#f8f5f0",
        }
        : baseStyle;

    return <div style={style}>{text}</div>;
}
