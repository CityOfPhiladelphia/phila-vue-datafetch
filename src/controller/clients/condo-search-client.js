import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class CondoSearchClient extends BaseClient {
  // fetch(input, category) {
  fetch(input) {
    console.log('condo client fetch', input);

    // const store = this.store;
    // let geocodeConfig;
    //
    // condoConfig = this.config.geocoder;
    // condoConfig.params.opa_only = true

    console.log("Condo Building Config")

    // const url = geocodeConfig.url(input);
    // const params = geocodeConfig.params;
    //
    // // update state
    // this.store.commit('', '');
    //
    // const success = this.success.bind(this);
    // const error = this.error.bind(this);
    //
    // // return a promise that can accept further chaining
    // return axios.get(url, { params })
    //   .then(success)
    //   .catch(error);
  }

  success(response) {
    const store = this.store;
    const data = response.data;
    const url = response.config.url;
    // console.log('geocode search success', response.config.url);

    return feature;
  }

  error(error) {
    const store = this.store;
  }
}

export default CondoSearchClient;
