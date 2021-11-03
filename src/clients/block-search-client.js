import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take a person, search AIS for them, and put
// the result in state.
class BlockSearchClient extends BaseClient {



  evaluateDataForUnits(data, features) {
    // console.log('base-client evaluateDataForUnits data:', data);

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id);
    // console.log("grouped data:", groupedData);

    for (let item in groupedData){
      groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) : dataList.push(groupedData[item][0]);
    }

    // console.log("evaluating data for units, units: ", units, units.length);

    // let bldgRecord = JSON.parse(JSON.stringify(data.rows[0]));

    if(units.length > 0) {
      units = _.groupBy(units, a => a.properties.pwd_parcel_id);
      features = features.filter(a => !Object.keys(units).includes(a.properties.pwd_parcel_id));
    }

    // console.log("Units List: ", units, "Data: ", data, "features: ", features );

    let bldgRecord = data.length > 0 ? JSON.parse(JSON.stringify(data[0])) : [];
    // console.log(bldgRecord);

    for (let unit in units) {
      // console.log(unit);
      for (let i in bldgRecord.properties) {
        bldgRecord.properties[i] = "";
      }
      // console.log(bldgRecord);
      let bldgRecordPush = JSON.parse(JSON.stringify(bldgRecord));
      bldgRecordPush.properties.opa_owners = "Condominium (" + units[unit].length + " Units)";
      // console.log(units[unit]);
      // if(this.store.state.parcels.pwd !== null) {
      //   console.log("pwd parcels: ", this.store.state.parcels.pwd);
      // }
      let record = units[unit][0].properties;
      bldgRecordPush.properties.opa_address =
        ( record.address_high === null ? record.address_low :
          record.address_low === null ? record.address_high :
            record.address_high + "-" + record.address_low ) +
        " " + record.street_full
      ;
      // console.log(bldgRecordPush);
      bldgRecordPush.condo = true;
      bldgRecordPush.properties.pwd_parcel_id = record.pwd_parcel_id;
      bldgRecordPush._featureId = record.pwd_parcel_id;
      features.push(bldgRecordPush);
      this.store.commit('setUnits', units);
      this.store.commit('setCondoUnitsStatus', 'success');
    }

    // console.log("Units List: ", units, "Data: ", data, "features: ", features );

    return features;
  }




  fetch(input) {
    console.log('block search client fetch, input:', input);

    const store = this.store;
    // console.log(store.state.parcels.pwd);

    const blockSearchConfig = this.config.blockSearch;
    const url = blockSearchConfig.url(input);
    const params = blockSearchConfig.params;
    // console.log('block search-client, blockSearchConfig:', blockSearchConfig, params);

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
    console.log('block search success, this:', this, 'response:', response);

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
      // console.log('getPages is running still going 2, pages:', this, features);

      let pages = Math.ceil(data.total_size / 100);

      if (pages > 1) {
        for (let counter = 2; counter<=pages; counter++) {
          // console.log(counter);
          params.page = counter;
          // console.log('in loop, counter:', counter, this, params.page);
          let pageResponse = await axios.get(url, { params });
          // console.log("page response: ", pageResponse);
          features = await features.concat(pageResponse.data.features);
          // console.log('response:', pageResponse, 'features:', features);
        }
      }


      // console.log(features);


      // this.store.commit('setCondoUnitsStatus', 'success');
      // return feature;
      // }
      // console.log("finished loop");
      params.page = 1;


      let units = features.filter(a => a.properties.unit_num != "");
      features = this.evaluateDataForUnits(units, features);

      // console.log(features);


      features = this.assignFeatureIds(features, 'block');

      // store.commit('setBlockSearchTotal', data.total_size);
      store.commit('setBlockSearchData', features);
      store.commit('setBlockSearchStatus', 'success');
      return features;
    }

    let features = data.features;

    let pages = Math.ceil(data.total_size / 100);
    // console.log("pages: ", pages, features);
    getPages = getPages.bind(this);
    // console.log("line before loop");
    return features = getPages(features);
  }

  error(error) {
    console.log('block search error', error);

    const store = this.store;
    store.commit('setBlockSearchStatus', 'error');
    store.commit('setBlockSearchData', null);
  }
}

export default BlockSearchClient;
