import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class GeocodeClient extends BaseClient {
  // fetch(input, category) {
  fetch(input) {
    // console.log('geocode client fetch', input);

    const store = this.store;
    let geocodeConfig;

    // if (category === 'address') {
    geocodeConfig = this.config.geocoder;
    // } else if (category === 'owner') {
    //   console.log('in geocode-client, category is owner');
    //   geocodeConfig = this.config.ownerSearch;
    // }
    // console.log('geocode-client, geocodeConfig:', geocodeConfig);
    const url = geocodeConfig.url(input);
    const params = geocodeConfig.params;

    // update state
    this.store.commit('setGeocodeStatus', 'waiting');
    // console.log('GEOCODE CLIENT setting last search method to geocode');
    // this.store.commit('setLastSearchMethod', 'geocode');

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    // console.log('geocode success', response.config.url);

    const store = this.store;
    const data = response.data;
    const url = response.config.url;
    // console.log(url)

    // TODO handle multiple results

    if (!data.features || data.features.length < 1) {
      // console.log('geocode got no features', data);

      return;
    }

    let features = data.features;
    features = this.assignFeatureIds(features, 'geocode');

    // TODO do some checking here
    // let feature = data.features[0];
    let feature = features[0];
    // let properties = feature.properties
    // console.log('geocode-client, feature:', feature);
    // properties = this.assignFeatureIds(properties, 'geocode');
    // feature.properties = properties;
    let relatedFeatures = [];
    for (let relatedFeature of features.slice(1)){
    // for (let relatedFeature of data.features.slice(1)){
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

  assignFeatureIds(features, dataSourceKey, topicId) {
    const featuresWithIds = [];

    // REVIEW this was not working with Array.map for some reason
    // it was returning an object when fetchJson was used
    // that is now converted to an array in fetchJson
    for (let i = 0; i < features.length; i++) {
      const suffix = (topicId ? topicId + '-' : '') + i;
      const id = `feat-${dataSourceKey}-${suffix}`;
      const feature = features[i];
      // console.log(dataSourceKey, feature);
      try {
        feature._featureId = id;
      }
      catch (e) {
        console.warn(e);
      }
      featuresWithIds.push(feature);
    }

    // console.log(dataSourceKey, features, featuresWithIds);
    return featuresWithIds;
  }

  error(error) {
    // console.log('geocode error', error);

    const store = this.store;

    store.commit('setGeocodeStatus', 'error');
    store.commit('setGeocodeData', null);
    store.commit('setGeocodeRelated', null);
  }
}

export default GeocodeClient;
