import axios from 'axios';
import BaseClient from './base-client';


class ShapeSearchClient extends BaseClient {

  evaluateParams(feature, dataSource) {
    // console.log('http-client evaluateParams is running');
    const params = {};
    if (!dataSource.options.params) { return params };
    const paramEntries = Object.entries(dataSource.options.params);
    const state = this.store.state;

    for (let [key, valOrGetter] of paramEntries) {
      let val;

      if (typeof valOrGetter === 'function') {
        // console.log(feature);
        val = valOrGetter(feature);
      } else {
        val = valOrGetter;
      }
      params[key] = val;
    }
    return params;
  }

  fetch(input) {
    const data =  input.map(a => a.properties.BRT_ID)

    const store = this.store;

    const shapeSearchConfig = this.config.shapeSearch;
    const url = shapeSearchConfig.url;

    let params = this.evaluateParams(data, shapeSearchConfig);

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    return axios.get(url, { params })
                                    .then(success)
                                    .catch(error);
  }

  success(response) {
    console.log("success respose: ", response);

    const store = this.store;
    let data = response.data;
    const url = response.config.url;

    let features = data.rows
    features = this.assignFeatureIds(features, 'shape');

    store.commit('setShapeSearchData', data);
    store.commit('setShapeSearchStatus', 'success');
    store.commit('setDrawShape', null)

    return features;
  }

  error(error) {
    return
  }
}

export default ShapeSearchClient;
