import { useEffect, useState } from 'react';
import '../styles/profile.css';

function FieldLabel({ children }) {
  return <label className="profile-label">{children}</label>;
}

function ProfilePage({ athlete, setAthlete, goBack }) {
  const [form, setForm] = useState({
    ...athlete,
    cycleTracking: athlete.cycleTracking ?? false,
    considerations: athlete.considerations ?? '',
    nutritionGuidance: athlete.nutritionGuidance ?? true,
    doesBulkCutCycles: athlete.doesBulkCutCycles ?? true,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      ...athlete,
      cycleTracking: athlete.cycleTracking ?? false,
      considerations: athlete.considerations ?? '',
      nutritionGuidance: athlete.nutritionGuidance ?? true,
      doesBulkCutCycles: athlete.doesBulkCutCycles ?? true,
    });
  }, [athlete]);

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    const cleaned = {
      ...form,
      age: Number(form.age) || 0,
      bodyweight: Number(form.bodyweight) || 0,
      heightFt: Number(form.heightFt) || 0,
      heightIn: Number(form.heightIn) || 0,
    };

    if (cleaned.gender !== 'female') {
      cleaned.cycleTracking = false;
    }

    setAthlete(cleaned);
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 1600);
  };

  return (
    <div className="screen profile-screen">
      <div className="profile-shell">
        <div className="profile-header glass-panel">
          <h1>Profile</h1>
          <p>Tell Coach Nova who you are and what training needs to account for.</p>
        </div>

        <div className="profile-section glass-panel">
          <h2>Identity</h2>

          <div className="profile-grid">
            <div className="profile-field">
              <FieldLabel>First name</FieldLabel>
              <input
                value={form.firstName || ''}
                onChange={(e) => handleChange('firstName', e.target.value)}
                placeholder="First name"
              />
            </div>

            <div className="profile-field">
              <FieldLabel>Last name</FieldLabel>
              <input
                value={form.lastName || ''}
                onChange={(e) => handleChange('lastName', e.target.value)}
                placeholder="Last name"
              />
            </div>

            <div className="profile-field">
              <FieldLabel>Age</FieldLabel>
              <input
                type="number"
                value={form.age ?? ''}
                onChange={(e) => handleChange('age', e.target.value)}
                placeholder="Age"
              />
            </div>

            <div className="profile-field">
              <FieldLabel>Sex</FieldLabel>
              <select
                value={form.gender || 'female'}
                onChange={(e) => handleChange('gender', e.target.value)}
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          </div>

          {form.gender === 'female' && (
            <div className="profile-toggle-row">
              <button
                type="button"
                className={`profile-check-toggle ${form.cycleTracking ? 'is-on' : ''}`}
                onClick={() => handleChange('cycleTracking', !form.cycleTracking)}
                aria-pressed={form.cycleTracking}
              >
                <span className="profile-check-box">{form.cycleTracking ? '✓' : ''}</span>
                <span>Optimize your training plan to your menstrual cycle</span>
              </button>
            </div>
          )}
        </div>

        <div className="profile-section glass-panel">
          <h2>Body metrics</h2>

          <div className="profile-grid">
            <div className="profile-field">
              <FieldLabel>Height (ft)</FieldLabel>
              <input
                type="number"
                value={form.heightFt ?? ''}
                onChange={(e) => handleChange('heightFt', e.target.value)}
                placeholder="Height (ft)"
              />
            </div>

            <div className="profile-field">
              <FieldLabel>Height (in)</FieldLabel>
              <input
                type="number"
                value={form.heightIn ?? ''}
                onChange={(e) => handleChange('heightIn', e.target.value)}
                placeholder="Height (in)"
              />
            </div>

            <div className="profile-field profile-field-full">
              <FieldLabel>Bodyweight (lb)</FieldLabel>
              <input
                type="number"
                value={form.bodyweight ?? ''}
                onChange={(e) => handleChange('bodyweight', e.target.value)}
                placeholder="Bodyweight (lb)"
              />
            </div>
          </div>
        </div>

        <div className="profile-section glass-panel">
          <h2>Training context</h2>

          <div className="profile-grid">
            <div className="profile-field">
              <FieldLabel>Main goal</FieldLabel>
              <select
                value={form.goal || 'strength'}
                onChange={(e) => handleChange('goal', e.target.value)}
              >
                <option value="strength">Strength</option>
                <option value="hypertrophy">Muscle growth</option>
                <option value="general">General fitness</option>
                <option value="fat_loss">Fat loss</option>
                <option value="performance">Sport performance</option>
              </select>
            </div>

            <div className="profile-field">
              <FieldLabel>Available equipment</FieldLabel>
              <select
                value={form.equipment || 'full gym'}
                onChange={(e) => handleChange('equipment', e.target.value)}
              >
                <option value="full gym">Full gym</option>
                <option value="barbell + rack">Barbell + rack</option>
                <option value="dumbbells">Dumbbells</option>
                <option value="bodyweight">Bodyweight only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="profile-section glass-panel">
          <h2>Nutrition preferences</h2>

          <div className="profile-toggle-row profile-toggle-row-tight">
            <button
              type="button"
              className={`profile-check-toggle ${form.nutritionGuidance ? 'is-on' : ''}`}
              onClick={() => handleChange('nutritionGuidance', !form.nutritionGuidance)}
              aria-pressed={form.nutritionGuidance}
            >
              <span className="profile-check-box">{form.nutritionGuidance ? '✓' : ''}</span>
              <span>Do you want nutrition considerations for your workout plan?</span>
            </button>
          </div>

          {form.nutritionGuidance && (
            <div className="profile-grid profile-grid-nutrition">
              <div className="profile-field">
                <FieldLabel>Do you do cutting/bulking cycles?</FieldLabel>
                <select
                  value={form.doesBulkCutCycles ? 'yes' : 'no'}
                  onChange={(e) => handleChange('doesBulkCutCycles', e.target.value === 'yes')}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="profile-section glass-panel">
          <h2>Considerations</h2>

          <p className="profile-help-text">
            Any considerations such as holidays, specific sports, injuries, or specific training goals
            (ie supplementing a marathon, military fitness test, cross fit, etc)?
          </p>

          <div className="profile-field">
            <textarea
              value={form.considerations || ''}
              onChange={(e) => handleChange('considerations', e.target.value)}
              placeholder="Examples: recovering from shoulder irritation, supplementing marathon training, preparing for a military fitness test, traveling for two weeks in June..."
              rows={7}
            />
          </div>
        </div>

        <div className="profile-actions">
          <button type="button" onClick={goBack} className="ghost-btn">
            Back
          </button>

          <button type="button" onClick={handleSave} className="primary-btn">
            Save profile
          </button>
        </div>

        {saved && <div className="profile-saved">Saved ✓</div>}
      </div>
    </div>
  );
}

export default ProfilePage;
