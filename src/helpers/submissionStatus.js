const { updateRecord } = require('./salesforce');

const MAX_RESPONSE_LENGTH = 30_000;
const LOG_TAIL_LINES = 60;

function formatTimestamp(date) {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function buildResponse({ lender, result, error, logs, startedAt, completedAt }) {
  const failedFiles = result?.files?.failed ?? [];
  const uploadedFiles = result?.files?.uploaded ?? [];
  const success = !error && failedFiles.length === 0;

  const lines = [
    success ? 'Success' : 'Error',
    `Portal: ${lender}`,
    `Completed: ${formatTimestamp(completedAt)}`,
    `Duration: ${((completedAt - startedAt) / 1000).toFixed(1)}s`,
  ];

  if (result?.message) lines.push(result.message);
  if (result?.files) {
    lines.push(`Files uploaded: ${uploadedFiles.length}${uploadedFiles.length ? ` (${uploadedFiles.join(', ')})` : ''}`);
    if (failedFiles.length) lines.push(`Files failed: ${failedFiles.join(', ')}`);
  }

  if (error) lines.push(`Error: ${error.message.split('\n')[0]}`);
  if (!success) {
    const tail = logs.slice(-LOG_TAIL_LINES);
    if (tail.length) lines.push('', 'Last log lines:', ...tail.map(l => `  ${l}`));
  }

  const text = lines.join('\n');
  return {
    status: success ? 'Submitted' : 'Failed',
    response: text.length > MAX_RESPONSE_LENGTH ? `${text.slice(0, MAX_RESPONSE_LENGTH)}\n…(truncated)` : text,
  };
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
