// Creates API_Lender_Mapping__c records for "IOU Financial - Portal API Settings"
// by copying the field mappings from "Fundomate - Portal Settings".
// Run in Dev Console > Execute Anonymous.

API_Lender_Setting__c setting = [
    SELECT Id FROM API_Lender_Setting__c
    WHERE Name = 'IOU Financial - Portal API Settings'
    LIMIT 1
];

List<API_Lender_Mapping__c> mappings = new List<API_Lender_Mapping__c>{
    // Business Data
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.grossAnnualSales',    SObject_Field_Name__c = 'Account.AnnualRevenue'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.city',                SObject_Field_Name__c = 'Account.BillingCity'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.zipCode',             SObject_Field_Name__c = 'Account.BillingPostalCode'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.billingState',        SObject_Field_Name__c = 'Account.BillingState'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.streetAddress',       SObject_Field_Name__c = 'Account.BillingStreet'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.streetAddressLine2',  SObject_Field_Name__c = 'Account.BillingStreet'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.inBusinessSince',     SObject_Field_Name__c = 'Account.Business_Start_Date__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.dba',                 SObject_Field_Name__c = 'Account.DBA__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.email',               SObject_Field_Name__c = 'Account.Email__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.businessType',        SObject_Field_Name__c = 'Account.Entity_Type__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.federalTaxId',        SObject_Field_Name__c = 'Account.Federal_Tax_ID__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.industryCategory',    SObject_Field_Name__c = 'Account.Industry'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.businessName',        SObject_Field_Name__c = 'Account.Name'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.phone',               SObject_Field_Name__c = 'Account.Phone'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'businessData.website',             SObject_Field_Name__c = 'Account.Website'),

    // Contact 1
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.dateOfBirth',         SObject_Field_Name__c = 'Owner__r.Birthdate'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.email',               SObject_Field_Name__c = 'Owner__r.Email'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.firstName',           SObject_Field_Name__c = 'Owner__r.FirstName'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.city',                SObject_Field_Name__c = 'Owner__r.Home_Address_City__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.state',               SObject_Field_Name__c = 'Owner__r.Home_Address_State__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.streetAddress',       SObject_Field_Name__c = 'Owner__r.Home_Address_Street__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.streetAddressLine2',  SObject_Field_Name__c = 'Owner__r.Home_Address_Street__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.zipCode',             SObject_Field_Name__c = 'Owner__r.Home_Address_Zip_Code__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.lastName',            SObject_Field_Name__c = 'Owner__r.LastName'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.phone',               SObject_Field_Name__c = 'Owner__r.MobilePhone'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.percentageOwned',     SObject_Field_Name__c = 'Owner__r.Ownership__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact1Data.ssn',                 SObject_Field_Name__c = 'Owner__r.Social_Security_Number__c'),

    // Contact 2
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.dateOfBirth',         SObject_Field_Name__c = 'Owner_2__r.Birthdate'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.email',               SObject_Field_Name__c = 'Owner_2__r.Email'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.firstName',           SObject_Field_Name__c = 'Owner_2__r.FirstName'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.city',                SObject_Field_Name__c = 'Owner_2__r.Home_Address_City__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.state',               SObject_Field_Name__c = 'Owner_2__r.Home_Address_State__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.streetAddressLine2',  SObject_Field_Name__c = 'Owner_2__r.Home_Address_Street__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.streetAddress',       SObject_Field_Name__c = 'Owner_2__r.Home_Address_Street__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.zipCode',             SObject_Field_Name__c = 'Owner_2__r.Home_Address_Zip_Code__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.lastName',            SObject_Field_Name__c = 'Owner_2__r.LastName'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.phone',               SObject_Field_Name__c = 'Owner_2__r.MobilePhone'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.percentageOwned',     SObject_Field_Name__c = 'Owner_2__r.Ownership__c'),
    new API_Lender_Mapping__c(API_Lender_Setting__c = setting.Id, API_Field_Name__c = 'contact2Data.ssn',                 SObject_Field_Name__c = 'Owner_2__r.Social_Security_Number__c')
};

insert mappings;
System.debug('Inserted ' + mappings.size() + ' mappings for IOU Financial - Portal API Settings');
