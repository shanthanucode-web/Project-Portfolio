export async function callCoachTrigger(payload) {
  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Coach API error');
  }
  return data;
}

export function coachResponseToText(response) {
  if (!response) return '';
  return [
    response.acknowledgement,
    response.correction,
    response.nextStep,
  ].filter(Boolean).join(' ');
}

export function coachResponseToAdvice(response) {
  if (!response) return [];
  return [
    response.acknowledgement,
    response.correction,
    response.nextStep,
  ].filter(Boolean);
}
