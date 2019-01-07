import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take a person, search AIS for them, and put
// the result in state.
class ShapeSearchClient extends BaseClient {
  fetch(input) {
    console.log('owner search client fetch', input);

    const store = this.store;

    const shapeSearchConfig = this.config.shapeSearch;
    // console.log('owner search-client, ownerSearchConfig:', ownerSearchConfig);
    const url = shapeSearchConfig.url();
    const params = shapeSearchConfig.options.params;
    console.log('shape search-client: url, params', url, params);
    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    console.log('shape search-client: axios', axios.get(url, { params }));
    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(success) {
    console.log('owner search success', success);
      return
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
