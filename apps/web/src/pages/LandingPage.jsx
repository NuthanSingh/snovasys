import { Link } from 'react-router-dom';
import { DEMO_NOTICE } from '@balancevault/shared';

const features = [
  { number: '01', title: 'A clear application', detail: 'Submit onboarding details and follow each review decision.' },
  { number: '02', title: 'Controlled access', detail: 'Private account views and administrator decisions stay permissioned.' },
  { number: '03', title: 'An accountable record', detail: 'Important account operations are designed to leave an audit trail.' },
];

export default function LandingPage() {
  return (
    <>
      <section className="intro landing-intro" aria-labelledby="page-title">
        <p className="eyebrow">Account operations, made accountable</p>
        <h1 id="page-title">Money movement with a ledger you can prove.</h1>
        <p className="intro-copy">{DEMO_NOTICE}</p>
        <div className="action-row">
          <Link className="button" to="/register">Start an application</Link>
          <Link className="text-link" to="/login">Already registered? Log in</Link>
        </div>
        <p className="stage-label">SECURE ACCOUNT ONBOARDING <span> / </span> SYNTHETIC DEMO</p>
      </section>
      <section className="capabilities" aria-label="BalanceVault approach">
        {features.map((feature) => (
          <article className="capability" key={feature.number}>
            <span className="capability-number">{feature.number}</span>
            <h2>{feature.title}</h2>
            <p>{feature.detail}</p>
          </article>
        ))}
      </section>
    </>
  );
}