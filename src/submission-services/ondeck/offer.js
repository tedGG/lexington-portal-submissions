const { objectNameForId, describeObject, getRecord, createRecord } = require('../../helpers/salesforce');

const OFFER_OBJECT = 'lex_Offer__c';
const OPPORTUNITY = 'Opportunity';
const DECLINED = 'Declined';

async function opportunityOf(submissionId, opportunityId, sandbox) {
  if (opportunityId) return opportunityId;
  const submissionObject = await objectNameForId(submissionId, sandbox);
  const { fields } = await describeObject(submissionObject, sandbox);
  const field = fields.find(f => f.type === 'reference' && (f.referenceTo || []).includes(OPPORTUNITY));
  if (!field) throw new Error(`${submissionObject} has no ${OPPORTUNITY} field to take the opportunity from`);
  const record = await getRecord(submissionObject, submissionId, [field.name], sandbox);
  if (!record[field.name]) throw new Error(`${submissionObject} ${submissionId} has no ${OPPORTUNITY} in ${field.name}`);
  return record[field.name];
}

async function createDeclinedOffer(submissionId, notes, { opportunityId, sandbox = false } = {}) {
  const opportunity = await opportunityOf(submissionId, opportunityId, sandbox);

  const record = {
    lex_Submission__c: submissionId,
    lex_Opportunity__c: opportunity,
    Status__c: DECLINED,
    lex_Notes__c: notes,
  };

  const result = await createRecord(OFFER_OBJECT, record, sandbox);
  console.log(`Salesforce ${OFFER_OBJECT} ${result.id} created: Status__c=${DECLINED}, lex_Submission__c=${submissionId}, lex_Opportunity__c=${opportunity}`);
  return { id: result.id, status: DECLINED, notes, opportunityId: opportunity };
}

module.exports = { createDeclinedOffer };
