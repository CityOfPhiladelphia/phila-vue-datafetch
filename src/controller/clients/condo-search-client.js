import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class CondoSearchClient extends BaseClient {

  evaluateDataForUnits(data) {

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id);

    for (let item in groupedData){
      groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      dataList.push(groupedData[item][0])
    }
    let mObj = JSON.parse(JSON.stringify(data[0]))

    if(units.length > 0) {
      units = _.groupBy(units, a => a.properties.pwd_parcel_id);
      data = data.filter(a => !Object.keys(units).includes(a.properties.pwd_parcel_id));
    }

    this.store.commit('setUnits', units);
  }

  fetch(input) {
    // console.log('geocode client fetch', input);

    const store = this.store;
    let condoConfig = JSON.parse(JSON.stringify(this.config.geocoder))
    condoConfig.url = this.config.geocoder.url

    condoConfig.params.opa_only = false
    condoConfig.params.include_units = true

    const url = condoConfig.url(input);
    const params = condoConfig.params;

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
    const data = response.data
    const url = response.config.url;
    // console.log('geocode search success', data);

    if (!data.features || data.features.length < 1) {
      return;
    }

    let features = data.features.filter(a => a.properties.unit_num === "");
    features.map( a => a.condo = true)
    let units = data.features.filter(a => a.properties.unit_num != "");

    features = this.assignFeatureIds(features, 'geocode');

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
    feature.properties.condo = true;

    units = this.evaluateDataForUnits(units);

    store.commit('setGeocodeData', feature);
    store.commit('setGeocodeRelated', relatedFeatures);
    store.commit('setGeocodeStatus', 'success');
    this.store.commit('setLastSearchMethod', 'geocode');

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
