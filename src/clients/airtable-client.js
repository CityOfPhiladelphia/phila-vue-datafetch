import Airtable from 'airtable';

import BaseClient from './base-client';

class AirtableClient extends BaseClient {

  fetch(feature, dataSource, dataSourceKey, targetIdFn) {
    console.log('airtable-client fetch is running, feature:', feature, 'dataSourceKey:', dataSourceKey);
    var base = new Airtable({ apiKey: 'keyvWacAcaLOuPZJq' }).base('appxMfxTM3tiTOD61');
    let store = this.store;
    let dataManager = this.dataManager;
    base('Table 1').select({
      maxRecords: 3,
      view: "Grid view",
    }).eachPage(function page(records) {
      // This function (`page`) will get called for each page of records.
      let data = [];
      // console.log('records:', records);
      for (let record of records) {
        console.log('record:', record);
        data.push(record.fields);
      }
      // store.commit('setDataset', data);
      dataManager.didFetchData(dataSourceKey, 'success', data);
    });
  }
}

export default AirtableClient;
