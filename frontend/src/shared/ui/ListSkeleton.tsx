type Props = {
  rows?: number;
  className?: string;
};

/** Lightweight list placeholders while CRM data loads. */
export function ListSkeleton({ rows = 5, className = "" }: Props): JSX.Element {
  return (
    <div className={`listSkeleton ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="listSkeletonRow">
          <div className="listSkeletonAvatar" />
          <div className="listSkeletonLines">
            <div className="listSkeletonLine wide" />
            <div className="listSkeletonLine" />
          </div>
        </div>
      ))}
    </div>
  );
}
