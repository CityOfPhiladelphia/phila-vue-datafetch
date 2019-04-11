import axios from 'axios';
import BaseClient from './base-client';


class ActiveSearchClient extends BaseClient {

  evaluateParams(feature, dataSource) {
    const params = {};
    if (!dataSource.options.params) { return params };
    // console.log("dataSource: ", dataSource);
    const paramEntries = Object.entries(dataSource.options.params);
    const state = this.store.state;

    for (let [key, valOrGetter] of paramEntries) {
      let val;

      if (typeof valOrGetter === 'function') {
        val = valOrGetter(feature);
      } else {
        val = valOrGetter;
      }
      params[key] = val;
    }
    // console.log("params: ", params)
    return params;
  }

  fetch(input) {
    // console.log("fetch() input: ", input)

    let activeSearches = this.config.activeSearch || {};
    let activeSearchKeys = Object.entries(activeSearches);

    for (let [activeSearchKey, activeSearch] of activeSearchKeys) {
      const state = this.store.state;
      let data = [];

      if(input.properties) {
        data = input.properties.opa_account_num;
      } else if (input.parcel_number) {
        data = input.parcel_number
      } else {
          data = input.map(a => a.parcel_number)
      }

      const store = this.store;
      const url = activeSearch.url;

      let params = this.evaluateParams(data, activeSearch);

      const successFn = activeSearch.options.success;

      // if the data is not dependent on other data
      axios.get(url, { params }).then(response => {
        // call success fn

        const store = this.store;
        let data = response.data;
        const url = response.config.url;
        let status = 'success';

        if (successFn) {
          data = successFn(data);
        }

        const setSourceDataOpts = {
          activeSearchKey,
          data,
          status,
        };

        store.commit('setActiveSearchData', setSourceDataOpts)
        store.commit('setActiveSearchStatus',setSourceDataOpts)

      }, response => {
        // console.log('fetch json error', response);
        let status = 'error';
        const setSourceDataOpts = {
          activeSearchKey,
          data,
          status,
        };
        store.commit('setActiveSearchData', setSourceDataOpts)
      });
    }
  }
}

export default ActiveSearchClient;
