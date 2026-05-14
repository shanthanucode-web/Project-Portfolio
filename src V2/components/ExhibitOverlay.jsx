function Paragraphs({ items }) {
  const paragraphs = Array.isArray(items) ? items : [items].filter(Boolean);
  return paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>);
}

function TitledCards({ items }) {
  return (
    <div className="story-card-list">
      {items.map((item) => (
        <section key={item.title} className="story-card">
          <h4>{item.title}</h4>
          <p>{item.body}</p>
        </section>
      ))}
    </div>
  );
}

function CoachNovaIntro({ project }) {
  return (
    <header className="coach-intro">
      <div className="coach-intro-copy">
        <span className="exhibit-kicker">{project.status}</span>
        <h2>{project.title}</h2>
        <p className="coach-summary">{project.summary}</p>
        <p className="role">{project.role}</p>
        <div className="tag-row">
          {project.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <div className="coach-intro-visual" aria-hidden="true">
        <img src={project.assets.logo} alt="" />
        <div className="coach-intro-signal">
          <span />
          <span />
          <span />
        </div>
      </div>
    </header>
  );
}

function DefaultIntro({ project }) {
  return (
    <>
      <div className="exhibit-kicker">{project.status}</div>
      <h2>{project.title}</h2>
      <p>{project.summary}</p>
      <p className="role">{project.role}</p>
      <div className="tag-row">
        {project.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </>
  );
}

export function ProjectExhibit({ project }) {
  const isCoachNova = project.id === 'coach-nova';
  const story = project.story;

  return (
    <div className="world-exhibit-shell">
      <article className={`world-exhibit ${story ? 'story-exhibit' : ''}`}>
        {isCoachNova ? <CoachNovaIntro project={project} /> : <DefaultIntro project={project} />}

        {isCoachNova && project.assets.demo && (
          <video className="demo-video" src={project.assets.demo} muted loop playsInline autoPlay controls />
        )}

        {story && (
          <div className="story-content">
            <section className="story-lede">
              <h3>The Story</h3>
              <p>
                Coach NOVA follows the path from field research to a barbell-mounted sensing prototype:
                understand the training environment, validate the motion signal, then deliver coaching at
                the moment an athlete can actually use it.
              </p>
            </section>

            <div className="story-timeline">
              {story.timeline.map((item) => (
                <section key={item.label}>
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <Paragraphs items={item.paragraphs || item.body} />
                </section>
              ))}
            </div>

            {story.media && (
              <div className="story-media">
                {story.media.map((item) => (
                  <figure key={item.src}>
                    <img src={item.src} alt={item.alt} />
                    <figcaption>{item.caption}</figcaption>
                  </figure>
                ))}
              </div>
            )}

            <section className="story-block">
              <h3>Key Insights</h3>
              <div className="insight-grid">
                {story.insights.map((insight) => (
                  <section key={insight.title}>
                    <h4>{insight.title}</h4>
                    <p>{insight.body}</p>
                  </section>
                ))}
              </div>
            </section>

            <section className="story-block">
              <h3>Architecture</h3>
              <div className="architecture-flow">
                {story.architecture.map((step, index) => (
                  <div key={step} className="architecture-step">
                    <code>{step}</code>
                    {index < story.architecture.length - 1 && <span aria-hidden="true">v</span>}
                  </div>
                ))}
              </div>
            </section>

            <section className="story-block">
              <h3>Build Decisions</h3>
              <TitledCards items={story.buildNotes} />
            </section>

            {story.reflections && (
              <section className="story-block story-prose">
                <h3>Reflections</h3>
                <Paragraphs items={story.reflections} />
              </section>
            )}

            <section className="story-block">
              <h3>Where It Goes Next</h3>
              <TitledCards items={story.nextSteps} />
            </section>
          </div>
        )}

        <div className="section-grid">
          {project.exhibitSections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>

        {project.references.length > 0 && (
          <div className="reference-list">
            <strong>Source context</strong>
            {project.references.map((reference) => (
              <code key={reference}>{reference}</code>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
