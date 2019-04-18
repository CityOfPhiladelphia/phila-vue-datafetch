import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take a person, search AIS for them, and put
// the result in state.
class OwnerSearchClient extends BaseClient {
  fetch(input) {
    // console.log('owner search client fetch', input);

    const store = this.store;

    const ownerSearchConfig = this.config.ownerSearch;
    // console.log('owner search-client, ownerSearchConfig:', ownerSearchConfig);
    const url = ownerSearchConfig.url(input);
    const params = ownerSearchConfig.params;
    // console.log('owner search client url', url);
    // update state
    this.store.commit('setOwnerSearchStatus', 'waiting');
    // this.store.commit('setLastSearchMethod', 'owner search');

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    return axios.get(url, { params })
      .then(success, error);
  }

  success(response) {
    console.log('owner search success', response.data);

    const store = this.store;
    const data = response.data;
    const url = response.config.url;
    // console.log(url)

    // TODO handle multiple results

    if (!data.features || data.features.length < 1) {
      // console.log('owner search got no features', data);

      return;
    }

    let features = data.features;
    features = this.assignFeatureIds(features, 'owner');

    // TODO do some checking here
    // const feature = data.features[0];
    // let relatedFeatures = [];
    // for (let relatedFeature of data.features.slice(1)){
    //   if (!!feature.properties.address_high) {
    //     if (relatedFeature.properties.address_high) {
    //       relatedFeatures.push(relatedFeature);
    //     }
    //   } else {
    //     relatedFeatures.push(relatedFeature);
    //   }
    // }
    store.commit('setShapeSearchStatus', null);
    store.commit('setShapeSearchData', null);
    store.commit('setOwnerSearchData', features);

    // store.commit('setOwnerSearchData', data.features);
    // store.commit('setOwnerSearchRelated', relatedFeatures);
    store.commit('setOwnerSearchStatus', 'success');

    return features;
  }

  error(error) {
    // console.log('owner search error', error);
    const store = this.store;
    store.commit('setOwnerSearchStatus', 'error');
    store.commit('setOwnerSearchData', null);
    // store.commit('setOwnerSearchRelated', null);
    throw error
  }
}

export default OwnerSearchClient;
