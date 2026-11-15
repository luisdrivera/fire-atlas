import { EmptyState } from '../common/EmptyState'
import type { CalendarMetric } from '../../types/fire'
import type {
  AnomalyAnalysis,
  WeeklyAnomaly,
} from '../../utils/anomaly'

interface UnusualConditionsProps {
  analysis: AnomalyAnalysis
  metric: CalendarMetric
}

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

function getMetricLabel(metric: CalendarMetric): string {
  return metric === 'detections' ? 'detections' : 'FRP'
}

function formatAnomaly(week: WeeklyAnomaly, metricLabel: string) {
  return {
    value: `${numberFormatter.format(week.value)} ${metricLabel}`,
    zScore:
      week.zScore === null ? 'Z-score unavailable' : numberFormatter.format(week.zScore),
  }
}

export function UnusualConditions({
  analysis,
  metric,
}: UnusualConditionsProps) {
  const metricLabel = getMetricLabel(metric)
  const latestWeek = analysis.latestAvailableWeek

  return (
    <section
      aria-labelledby="unusual-conditions-title"
      className="dashboard-section unusual-conditions-panel"
      id="unusual-conditions"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">WEEKLY ANOMALIES</p>
          <h2 id="unusual-conditions-title">Unusual conditions</h2>
        </div>
        <span className="section-meta">HISTORICAL · NOT REAL-TIME</span>
      </div>
      <div className="unusual-conditions-grid">
        <div className="anomaly-ranking-panel">
          <h3>Five weeks with the highest z-scores</h3>
          {analysis.topAnomalies.length === 0 ? (
            <EmptyState message="No weeks have a calculable anomaly score for this region and metric." />
          ) : (
            <ol
              aria-label="Weeks with the highest anomaly z-scores"
              className="anomaly-ranking"
            >
              {analysis.topAnomalies.map((week, index) => {
                const formatted = formatAnomaly(week, metricLabel)
                return (
                  <li key={week.date}>
                    <span aria-hidden="true" className="anomaly-rank">
                      {index + 1}
                    </span>
                    <div className="anomaly-week-details">
                      <strong>Week starting {week.date}</strong>
                      <span>{formatted.value}</span>
                    </div>
                    <span className="anomaly-z-score">
                      z {formatted.zScore}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
        <article
          aria-label="Latest available week anomaly classification"
          className="latest-week-card"
        >
          <p className="eyebrow">LATEST AVAILABLE WEEK</p>
          {latestWeek ? (
            <>
              <h3>{latestWeek.date}</h3>
              <p className="latest-week-disclaimer">
                Based on the last week covered by the dataset; not real-time.
              </p>
              <dl className="latest-week-summary">
                <div>
                  <dt>Value</dt>
                  <dd>{formatAnomaly(latestWeek, metricLabel).value}</dd>
                </div>
                <div>
                  <dt>Z-score</dt>
                  <dd>{formatAnomaly(latestWeek, metricLabel).zScore}</dd>
                </div>
                <div>
                  <dt>Classification</dt>
                  <dd>{analysis.latestClassification}</dd>
                </div>
              </dl>
            </>
          ) : (
            <EmptyState message="No covered week is available in this dataset." />
          )}
        </article>
      </div>
    </section>
  )
}
