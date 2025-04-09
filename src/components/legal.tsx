export function Legal() {
  return (
    <div className="text-muted-foreground [&_a]:hover:text-primary text-center text-xs text-balance [&_a]:underline [&_a]:underline-offset-4">
      By clicking continue, you agree to our{" "}
      <a href="/terms">Terms of Service</a> and{" "}
      <a href="/privacy">Privacy Policy</a>.
    </div>
  );
}
