import axios from 'axios';
// import httpsProxyAgent from 'https-proxy-agent';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class GeocodeClient extends BaseClient {
  // fetch(input, category) {
  async fetch(input) {
    console.log('geocode client fetch', input)//, 'this.store:', this.store);

    const store = this.store;
    let geocodeConfig;

    geocodeConfig = this.config.geocoder;
    const url = geocodeConfig.url(input);
    // const agent = new httpsProxyAgent('http://proxy.phila.gov:8080');

    const params = geocodeConfig.params;
    // const proxy = geocodeConfig.proxy;

    console.log('url:', url, 'typeof url:', typeof url, 'params:', params);

    // update state
    this.store.commit('setGeocodeStatus', 'waiting');

    const success = this.success.bind(this);
    const error = this.error.bind(this);
    // const config = { params, proxy };
    // console.log('config:', config);

    // return a promise that can accept further chaining
    // return await axios.request({ url: url, httpsAgent: agent }, { params })
    return await axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    console.log('geocode success is running');
    const store = this.store;
    const data = response.data;
    const url = response.config.url;

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
    return feature;
  }

  error(error) {
    console.log('geocode error is running, error:', error);
    const store = this.store;
    store.commit('setGeocodeStatus', 'error');
    store.commit('setGeocodeData', null);
    store.commit('setGeocodeRelated', null);
  }
}

export default GeocodeClient;
