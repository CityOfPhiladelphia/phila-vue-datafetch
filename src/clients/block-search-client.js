import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take a person, search AIS for them, and put
// the result in state.
class BlockSearchClient extends BaseClient {
  fetch(input) {
    // console.log('block search client fetch', input);

    const store = this.store;

    const blockSearchConfig = this.config.blockSearch;
    // console.log('block search-client, blockSearchConfig:', blockSearchConfig);
    const url = blockSearchConfig.url(input);
    const params = blockSearchConfig.params;

    // update state
    this.store.commit('etOwnerSearchStatus', 'waiting');
    // console.log('block SEARCH CLIENT setting last search method to block search');
    this.store.commit('setLastSearchMethod', 'owner search');

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    // console.log('block search success', response.config.url);

    const store = this.store;
    const data = response.data;
    const url = response.config.url;

    if (!data.features || data.features.length < 1) {
      // console.log('block search got no features', data);

      return;
    }

    let features = data.features;
    features = this.assignFeatureIds(features, 'owner');

 
    store.commit('setOwnerSearchTotal', data.total_size);
    store.commit('setOwnerSearchData', features);
    // store.commit('setOwnerSearchData', data.features);
    // store.commit('setOwnerSearchRelated', relatedFeatures);
    store.commit('setOwnerSearchStatus', 'success');

    return features;
  }

  error(error) {
    // console.log('block search error', error);

    const store = this.store;
    store.commit('setOwnerSearchStatus', 'error');
    store.commit('setOwnerSearchData', null);
  }
}

export default BlockSearchClient;