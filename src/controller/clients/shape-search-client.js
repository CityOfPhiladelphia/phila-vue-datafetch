import axios from 'axios';
import BaseClient from './base-client';


class ShapeSearchClient extends BaseClient {

  evaluateParams(feature, dataSource) {
    console.log('http-client evaluateParams is running');
    const params = {};
    if (!dataSource.options.params) { return params };
    const paramEntries = Object.entries(dataSource.options.params);
    const state = this.store.state;

    for (let [key, valOrGetter] of paramEntries) {
      let val;

      if (typeof valOrGetter === 'function') {
        console.log(feature);
        val = valOrGetter(feature);
      } else {
        val = valOrGetter;
      }

      params[key] = val;
    }
    return params;
  }

  fetch(input) {
    console.log('shape search client fetch', input);
    const data =  input.map(a => a.properties.BRT_ID)
    console.log('shape search client fetch', data);

    const store = this.store;

    const shapeSearchConfig = this.config.shapeSearch;
    const url = shapeSearchConfig.url;
    console.log('shapeSearchConfig.url: ', url);
    let params = this.evaluateParams(data, shapeSearchConfig);
    console.log('shapeSearchConfig.params: ', params);
    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    console.log('shape search-client: axios', axios.get(url, { params }));
    return axios.get(url, { params })
                                    .then(success)
                                    .catch(error);
  }

  success(response) {
    console.log('owner search success', response.config.url);

    const store = this.store;
    let data = response.data;
    const url = response.config.url;
    console.log(url)

    // TODO handle multiple results

    // if (!data.features || data.features.length < 1) {
    //   console.log('owner search got no features', data);
    //   return;
    // }

    // data = this.assignFeatureIds(data, 'drawShape');
    // console.log('assignFeatureIds', data);

    store.commit('setShapeSearchData', data);
    // store.commit('setOwnerSearchData', data.features);
    // store.commit('setOwnerSearchRelated', relatedFeatures);
    store.commit('setShapeSearchStatus', 'success');

    return data;
  }

  error(error) {
    console.log('owner search error', error);
    return
  }
  // success(response) {
  //   console.log('owner search success', response.config.url);
  //
  //   store.commit('setOwnerSearchData', features);
  //   // store.commit('setOwnerSearchData', data.features);
  //   // store.commit('setOwnerSearchRelated', relatedFeatures);
  //   store.commit('setOwnerSearchStatus', 'success');
  //
  //   return features;
  // }
  //
  // error(error) {
  //   console.log('owner search error', error);
  //
  // }
}

export default ShapeSearchClient;
