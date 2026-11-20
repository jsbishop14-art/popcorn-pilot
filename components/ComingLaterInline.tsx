export function ComingLaterInline({ text }: { text: string }) {
  return (
    <div className="card" role="note">
      <span className="s">{text}</span>
    </div>
  );
}
