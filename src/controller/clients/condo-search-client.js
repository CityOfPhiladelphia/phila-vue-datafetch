import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class CondoSearchClient extends BaseClient {

  evaluateDataForUnits(data) {

    // console.log("units input:", data)

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id);

    for (let item in groupedData){
      groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      dataList.push(groupedData[item][0])
    }
    let mObj = JSON.parse(JSON.stringify(data[0]))

    if(units.length > 0) {
      units = _.groupBy(units, a => a.properties.pwd_parcel_id);
    }
    console.log("commit setUnits: ", units)
    this.store.commit('setUnits', units);

    return data
  }

  fetch(input) {
    console.log('condo search client fetch', input);

    const store = this.store;
    let condoConfig = JSON.parse(JSON.stringify(this.config.geocoder))
    condoConfig.url = this.config.geocoder.url

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
    let features = data.features;
    const url = response.config.url;
    let params = response.config.params;
    // console.log('geocode search success', url, 'data:', data, 'params:', params, response.config.params);

    if (!data.features || data.features.length < 1) {
      return;
    }

    async function getPages(features) {
      // console.log('still going 2, pages:', );

      let pages = Math.ceil(data.total_size / 100)

      if (pages > 1) {
        for (let counter = 2; counter<=pages; counter++) {
          // console.log('in loop, counter:', counter, this);
          params.page = counter;
          let pageResponse = await axios.get(url, { params })
          features = await features.concat(pageResponse.data.features)
          // console.log('response:', pageResponse, 'features:', features)
        }
      }

      // features = features.filter(a => a.geometry.geocode_type === "pwd_parcel");

      let units = features.filter(a => a.properties.unit_num != "");
      units = this.evaluateDataForUnits(units);

      console.log("about to start feature: ", units[0])

      var feature = JSON.parse(JSON.stringify(units[0]))
      for (let i in feature.properties) {
        feature.properties[i] = ""
        console.log(feature.properties[i])
        }

      if(this.store.state.parcels.pwd != null) {
        feature.properties.street_address = this.store.state.parcels.pwd.properties.ADDRESS
        feature.properties.opa_address = this.store.state.parcels.pwd.properties.ADDRESS
        feature.properties.pwd_parcel_id = this.store.state.parcels.pwd.properties.PARCELID
        feature._featureId = this.store.state.parcels.pwd.properties.PARCELID.toString()
      } else {
        const latLng = {lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0]}
        this.dataManager.getParcelsByLatLng(latLng, 'pwd', null)
        console.log("feature: ", feature, "parcel: ", this.store.state.parcels)
        feature.properties.street_address = this.store.state.parcels.pwd.properties.ADDRESS
        // feature.properties.opa_address = this.store.state.parcels.pwd.properties.ADDRESS
        feature.properties.pwd_parcel_id = this.store.state.parcels.pwd.properties.PARCELID
        feature._featureId = this.store.state.parcels.pwd.properties.PARCELID.toString()
      }

      console.log("Starting assignFeatureIds: ", feature)
      feature = this.assignFeatureIds(feature, 'geocode');
      feature.condo = true

      console.log("feature: ", feature)

      store.commit('setGeocodeData', feature);
      store.commit('setGeocodeStatus', 'success');
      this.store.commit('setLastSearchMethod', 'geocode');

      return feature;
    }

    getPages = getPages.bind(this);
    return getPages(features)
  }

  error(error) {
    const store = this.store;

    store.commit('setGeocodeStatus', 'error');
    store.commit('setGeocodeData', null);
    store.commit('setGeocodeRelated', null);
  }
}

export default CondoSearchClient;
