/**
 * Getting in, end to end: sign in, then two optional extras. There is one
 * sign-in path (register number + password), so there is nothing to choose
 * between and no device-specific branch.
 */
const STEPS: readonly { title: string; body: React.ReactNode }[] = [
  {
    title: "Sign in",
    body: (
      <p>
        Your ERP register number and password. Nothing to install, nothing to copy.
      </p>
    ),
  },
  {
    title: "Add it to your home screen",
    body: (
      <p>
        Optional. Android (Chrome): menu, then Install app. iPhone (Safari): Share, then Add to
        Home Screen.
      </p>
    ),
  },
  {
    title: "Connect your LMS",
    body: (
      <p>
        Optional. The dashboard shows a Connect LMS card. One password, once, and your courses and
        deadlines appear.
      </p>
    ),
  },
];

export function GetStarted() {
  return (
    <div>
      <ol className="border-t border-border">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-b border-border py-5"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent font-display text-subheading font-semibold tabular-nums text-accent-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h4 className="text-subheading font-semibold">{s.title}</h4>
              <div className="mt-1 text-body leading-relaxed text-muted-foreground">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
