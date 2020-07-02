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
    this.store.commit('setBlockSearchStatus', 'waiting');
    // console.log('block SEARCH CLIENT setting last search method to block search');
    this.store.commit('setLastSearchMethod', 'block search');

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
    // let features = data.features;
    let params = response.config.params;
    

    if (!data.features || data.features.length < 1) {
      // console.log('block search got no features', data);
      return;
    }

    async function getPages(features) {
      console.log('getPages is running still going 2, pages:', this, features);
      console.log(blockSearchConfig);

      let pages = Math.ceil(data.total_size / 100);

      if (pages > 1) {
        for (let counter = 2; counter<=pages; counter++) {
          params.page = counter;
          console.log('in loop, counter:', counter, this, params.page);
          let pageResponse = await axios.get(url, { params });
          console.log("page response: ", pageResponse);
          features = await features.concat(pageResponse.data.features);
          console.log('response:', pageResponse, 'features:', features);
        }
      }

      console.log(features);

      // let units = features.filter(a => a.properties.unit_num != "");
      // units = this.evaluateDataForUnits(units);

      // var feature = JSON.parse(JSON.stringify(units[0]));
      // for (let i in feature.properties) {
      //   feature.properties[i] = "";
      // }

      // if(this.store.state.parcels.pwd === null) {
      //   // this.setFeatureProperties(feature, totalUnits);

      //   console.log('condo-search-client, getPages else is still running 1');
      //   store.commit('setGeocodeData', feature);
      //   store.commit('setGeocodeStatus', 'success');
      //   // console.log('getPages else is still running 2');
      //   if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
      //     this.store.commit('setLastSearchMethod', 'geocode');
      //   }
      //   // console.log('feature:', feature);
      // } else {
      //   this.setFeatureProperties(feature, totalUnits);

      //   console.log('condo-search-client getPages else is still running 1');
      //   store.commit('setGeocodeData', feature);
      //   store.commit('setGeocodeStatus', 'success');
      // console.log('getPages else is still running 2');
      // console.log('feature:', feature);
      // }

      // this.store.commit('setCondoUnitsStatus', 'success');
      // return feature;
      // }
      
      features = this.assignFeatureIds(features, 'block');
  
   
      store.commit('setBlockSearchTotal', data.total_size);
      store.commit('setBlockSearchData', features);
      store.commit('setBlockSearchStatus', 'success');
      return features;
    }
    
    let features = data.features;

    let pages = Math.ceil(data.total_size / 100);
    console.log("pages: ", pages);
    console.log("block features: ", features);
    console.log("pages: ", pages, features);
    getPages = getPages.bind(this); 
    console.log("line before loop");
    return features = getPages(features);
  }

  error(error) {
    // console.log('block search error', error);

    const store = this.store;
    store.commit('setBlockSearchStatus', 'error');
    store.commit('setBlockSearchData', null);
  }
}

export default BlockSearchClient;