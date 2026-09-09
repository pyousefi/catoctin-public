export function SiteVersion() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "development";
  const commit = process.env.NEXT_PUBLIC_APP_COMMIT?.slice(0, 7);
  return (
    <span className="site-version" aria-label="Site version">
      Version {version}
      {commit ? ` · ${commit}` : ""}
    </span>
  );
}
