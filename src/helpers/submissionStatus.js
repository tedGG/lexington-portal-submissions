const { updateRecord } = require('./salesforce');

const MAX_RESPONSE_LENGTH = 30_000;
const LOG_TAIL_LINES = 60;

function buildResponse({ lender, result, error, logs, startedAt, completedAt }) {
  const failedFiles = result?.files?.failed ?? [];
  const uploadedFiles = result?.files?.uploaded ?? [];
  const success = !error && failedFiles.length === 0;

  const payload = {
    status: success ? 'Success' : 'Error',
    portal: lender,
    completedAt: completedAt.toISOString(),
    durationSeconds: Number(((completedAt - startedAt) / 1000).toFixed(1)),
  };

  if (result?.message) payload.message = result.message;
  if (error) payload.error = error.message.split('\n')[0];
  if (result?.applicationUrl) payload.applicationUrl = result.applicationUrl;
  if (typeof result?.owners === 'number') payload.owners = result.owners;

  if (result?.files) {
    payload.files = {
      uploadedCount: uploadedFiles.length,
      uploaded: uploadedFiles,
      failedCount: failedFiles.length,
      failed: failedFiles,
    };
  }

  if (Array.isArray(result?.screenshots) && result.screenshots.length) {
    payload.screenshots = result.screenshots;
  }

  if (!success) payload.logs = logs.slice(-LOG_TAIL_LINES);

  return { status: success ? 'Submitted' : 'Failed', response: serialize(payload) };
}

function serialize(payload) {
  let json = JSON.stringify(payload);
  if (json.length <= MAX_RESPONSE_LENGTH) return json;

  while (payload.logs && payload.logs.length && json.length > MAX_RESPONSE_LENGTH) {
    payload.logs = payload.logs.slice(Math.ceil(payload.logs.length / 4));
    payload.logsTruncated = true;
    json = JSON.stringify(payload);
  }
  if (json.length <= MAX_RESPONSE_LENGTH) return json;

  const trimmed = {
    status: payload.status,
    portal: payload.portal,
    completedAt: payload.completedAt,
    durationSeconds: payload.durationSeconds,
    error: payload.error,
    message: payload.message,
    truncated: true,
  };
  return JSON.stringify(trimmed).slice(0, MAX_RESPONSE_LENGTH);
}

async function reportSubmission(recordId, details) {
  if (!recordId) {
    console.log('No submissionId in payload, skipping Salesforce status update');
    return { updated: false, reason: 'no submissionId' };
  }

  const { status, response } = buildResponse({ ...details, completedAt: new Date() });
  try {
    const objectName = await updateRecord(recordId, { lex_Status__c: status, lex_Api_Response__c: response });
    console.log(`Salesforce ${objectName} ${recordId} updated: lex_Status__c=${status}`);
    return { updated: true, objectName, status };
  } catch (err) {
    console.error(`Salesforce status update failed for ${recordId}: ${err.message}`);
    return { updated: false, reason: err.message, status };
  }
}

module.exports = { reportSubmission, buildResponse };
