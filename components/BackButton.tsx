type Props = {
  onClick: () => void;
  label?: string;
};

export function BackButton({ onClick, label = "Back" }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed top-5 left-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-amber-300 text-black shadow-[0_8px_24px_rgb(252_211_77_/_0.35)] transition hover:bg-amber-200"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path
          d="M15 5.5 8.5 12 15 18.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
