import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class CondoSearchClient extends BaseClient {
  // fetch(input, category) {
  // const store = this.store;
  //
  //
  // console.log("Condo Building Config")
  //
  // if (this.store.state.lastSearchMethod == "owner search") {
  //
  // }
  fetch(input) {
    console.log('geocode client fetch', this);

    const store = this.store;
    let condoConfig = JSON.parse(JSON.stringify(this.config.geocoder))
    condoConfig.url = this.config.geocoder.url
    console.log(condoConfig)

    condoConfig.params.opa_only = false

    const url = condoConfig.url(input);
    const params = condoConfig.params;
    console.log(params)

    // update state
    this.store.commit('setGeocodeStatus', 'waiting');

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    const store = this.store;
    const data = response.data;
    const url = response.config.url;
    console.log('geocode search success', data);

    // TODO handle multiple results

    if (!data.features || data.features.length < 1) {
      return;
    }

    let features = data.features;

    features = this.assignFeatureIds(features, 'geocode');

    // TODO do some checking here
    let feature = features[0];
    let relatedFeatures = [];
    for (let relatedFeature of features.slice(1)){
      if (!!feature.properties.address_high) {
        if (relatedFeature.properties.address_high) {
          relatedFeatures.push(relatedFeature);
        }
      } else {
        relatedFeatures.push(relatedFeature);
      }
    }
    store.commit('setGeocodeData', feature);
    store.commit('setGeocodeRelated', relatedFeatures);
    store.commit('setGeocodeStatus', 'success');
    this.store.commit('setLastSearchMethod', 'geocode');

    console.log(feature)
    return feature;
  }

  error(error) {
    const store = this.store;

    store.commit('setGeocodeStatus', 'error');
    store.commit('setGeocodeData', null);
    store.commit('setGeocodeRelated', null);
  }
}

export default CondoSearchClient;
