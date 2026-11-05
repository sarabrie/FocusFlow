import React, { useEffect, useRef, useState } from 'react';
import { formatPercent, formatPosition } from '../format';
import { LOW_THRESHOLD, lowSegments, parseServerDate } from '../historyStats';

// Hand-drawn SVG charts sized to their container in real pixels, so text never stretches.
// Time runs left→right (like the video player) even though the page is RTL.
const PAD = { top: 18, right: 14, bottom: 26, left: 38 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function YAxis({ width, height, y }) {
  return (
    <g className="chart-axis">
      {Y_TICKS.map((tick) => (
        <g key={tick}>
          <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
          <text x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{Math.round(tick * 100)}%</text>
        </g>
      ))}
      {/* Named in the panel legend, not inline: an inline label collides with bars on narrow screens. */}
      <line className="chart-threshold" x1={PAD.left} x2={width - PAD.right} y1={y(LOW_THRESHOLD)} y2={y(LOW_THRESHOLD)} />
      <line className="chart-baseline" x1={PAD.left} x2={width - PAD.right} y1={height - PAD.bottom} y2={height - PAD.bottom} />
    </g>
  );
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.lines.map((line) => <span key={line}>{line}</span>)}
    </div>
  );
}

const shortDate = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' });

// One column per session (oldest → newest), height = average concentration.
export function SessionTrendChart({ sessions, onSelect, height = 200 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const data = sessions.filter((s) => s.average_score !== null).slice(0, 12).reverse();

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, band * 0.6);
  const y = (v) => PAD.top + (1 - v) * (height - PAD.top - PAD.bottom);
  const x = (i) => PAD.left + band * i + band / 2;
  const showEveryLabel = band >= 44;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} dir="ltr" role="img" aria-label="ריכוז ממוצע לפי סשן">
          <YAxis width={width} height={height} y={y} />
          {data.map((session, i) => {
            const top = y(session.average_score);
            const bottom = height - PAD.bottom;
            const r = Math.min(4, barW / 2, bottom - top);
            const left = x(i) - barW / 2;
            const isLast = i === data.length - 1;
            const date = parseServerDate(session.started_at);
            return (
              <g key={session.id}>
                {/* Rounded data-end, square at the baseline. */}
                <path
                  className={hover === i ? 'chart-bar is-hover' : 'chart-bar'}
                  d={`M${left},${bottom} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${bottom} Z`}
                />
                {isLast && <text className="chart-value" x={x(i)} y={top - 6} textAnchor="middle">{formatPercent(session.average_score)}</text>}
                {(showEveryLabel || i === 0 || isLast) && date && (
                  <text className="chart-x-label" x={x(i)} y={height - 8} textAnchor="middle">{shortDate.format(date)}</text>
                )}
                {/* Full-height hit target, wider than the bar. */}
                <rect
                  className="chart-hit"
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={height - PAD.top - PAD.bottom}
                  tabIndex={0}
                  aria-label={`${session.content_title || 'תוכן שנמחק'}: ${formatPercent(session.average_score)}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelect?.(session.id)}
                  onKeyDown={(event) => event.key === 'Enter' && onSelect?.(session.id)}
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip
        tip={hover === null || !data[hover] ? null : {
          x: x(hover),
          y: y(data[hover].average_score),
          lines: [data[hover].content_title || 'תוכן שנמחק', `${formatPercent(data[hover].average_score)} · ${data[hover].reading_count} מדידות`],
        }}
      />
    </div>
  );
}

// Concentration along the content (video seconds or text scroll %), with low stretches shaded.
export function TimelineChart({ readings, contentType, height = 240 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const points = [...readings].sort((a, b) => a.position - b.position);

  if (!points.length) return <div className="chart-empty">אין מדידות בסשן הזה.</div>;

  const minX = points[0].position;
  const maxX = Math.max(points.at(-1).position, minX + 1);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const x = (v) => PAD.left + ((v - minX) / (maxX - minX)) * plotW;
  const y = (v) => PAD.top + (1 - v) * (height - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.position)},${y(p.score)}`).join(' ');
  const area = `${line} L${x(points.at(-1).position)},${y(0)} L${x(points[0].position)},${y(0)} Z`;
  const lowest = points.reduce((min, p) => (p.score < min.score ? p : min), points[0]);
  const last = points.at(-1);
  const xTicks = [minX, minX + (maxX - minX) / 2, maxX];

  function handleMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.position) - px) < Math.abs(x(points[nearest].position) - px)) nearest = i;
    });
    setHover(nearest);
  }

  const hovered = hover === null ? null : points[hover];

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} dir="ltr" role="img" aria-label="ריכוז לאורך התוכן">
          {lowSegments(points).map((segment) => {
            // Clamp the band to the plot so a dip at the very start/end doesn't spill past the axis.
            const left = Math.max(PAD.left, x(segment.from) - 3);
            const right = Math.min(width - PAD.right, x(segment.to) + 3);
            return (
              <rect key={segment.from} className="chart-low-band" x={left} y={PAD.top} width={Math.max(0, right - left)} height={height - PAD.top - PAD.bottom} />
            );
          })}
          <YAxis width={width} height={height} y={y} />
          {xTicks.map((tick, i) => (
            <text key={tick} className="chart-x-label" x={x(tick)} y={height - 8} textAnchor={['start', 'middle', 'end'][i]}>
              {formatPosition(tick, contentType)}
            </text>
          ))}
          <path className="chart-area" d={area} />
          <path className="chart-line" d={line} />
          {lowest.score < LOW_THRESHOLD && (
            <g>
              <circle className="chart-dot is-low" cx={x(lowest.position)} cy={y(lowest.score)} r="4.5" />
              {/* Below the dot normally; above it when the dot sits near the floor and would hit the x-axis labels. */}
              <text
                className="chart-value"
                x={x(lowest.position)}
                y={y(lowest.score) > height - PAD.bottom - 24 ? y(lowest.score) - 10 : y(lowest.score) + 17}
                textAnchor="middle"
              >
                הכי נמוך {formatPercent(lowest.score)}
              </text>
            </g>
          )}
          <circle className="chart-dot" cx={x(last.position)} cy={y(last.score)} r="4.5" />
          {hovered && (
            <g pointerEvents="none">
              <line className="chart-crosshair" x1={x(hovered.position)} x2={x(hovered.position)} y1={PAD.top} y2={height - PAD.bottom} />
              <circle className="chart-dot" cx={x(hovered.position)} cy={y(hovered.score)} r="5" />
            </g>
          )}
          <rect
            className="chart-hit"
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={height - PAD.top - PAD.bottom}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
      <Tooltip
        tip={hovered ? {
          x: x(hovered.position),
          y: y(hovered.score),
          lines: [`${contentType === 'link' ? 'בדקה' : 'במיקום'} ${formatPosition(hovered.position, contentType)}`, `ריכוז ${formatPercent(hovered.score)}`],
        } : null}
      />
    </div>
  );
}
