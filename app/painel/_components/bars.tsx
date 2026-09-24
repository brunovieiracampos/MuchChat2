export function Bars({ data, height = 166 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barMax = height - 40;
  return (
    <div className="pn-bars" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
      {data.map((d, i) => (
        <div className="pn-bar-col" key={i}>
          <div className="pn-bar-val">{d.value}</div>
          <div className={`pn-bar${d.value ? "" : " is-zero"}`} style={{ height: Math.max(2, Math.round((d.value / max) * barMax)) }} />
          <div className="pn-bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
