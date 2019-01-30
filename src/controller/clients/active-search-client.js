import axios from 'axios';
import BaseClient from './base-client';


class ActiveSearchClient extends BaseClient {

  evaluateParams(feature, dataSource) {
    const params = {};
    if (!dataSource.options.params) { return params };
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
    return params;
  }

  fetch(input) {
    let data = [];
    if(input.properties) {
      data = input.properties.opa_account_num;
    } else {
      data = input.parcel_number
    }

    const store = this.store;
    const activeSearchConfig = this.config.activeSearch;
    const url = activeSearchConfig.url;

    let params = this.evaluateParams(data, activeSearchConfig);

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    return axios.get(url, { params })
                                    .then(success)
                                    .catch(error);
  }

  success(response) {

    const store = this.store;
    let data = response.data;
    const url = response.config.url;

    store.commit('setActiveSearchData', data);
    store.commit('setActiveSearchStatus', 'success');

    return data;
  }

  error(error) {
    return
  }
}

export default ActiveSearchClient;
